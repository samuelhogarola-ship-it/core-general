import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const database = process.env.CORE_TEST_DATABASE_URL;
const run = (sql) =>
  execFileSync("psql", [database, "-XAt", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const asUser = (id, sql) =>
  run(
    `begin; set local role authenticated; set local request.jwt.claim.sub = '${id}'; ${sql}; rollback;`,
  );
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const intake = "10000000-0000-0000-0000-000000000001";

test(
  "database tenant isolation and conversion",
  { skip: !database },
  async (t) => {
    // Destructive setup is deliberately limited to an explicitly supplied disposable database.
    run(`drop schema if exists public cascade; create schema public; grant usage on schema public to public;
    create schema if not exists auth; create schema if not exists net;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    create table if not exists auth.users(id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create or replace function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ select 1::bigint $$;`);
    for (const file of readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      run(
        readFileSync(`supabase/migrations/${file}`, "utf8").replace(
          "create extension if not exists pg_net;",
          "",
        ),
      );
    }
    run(`insert into auth.users values ('${a}'), ('${b}') on conflict do nothing;
    do $$ begin if to_regclass('public.intake_tenant_members') is not null then
      insert into public.intake_tenant_members(tenant_id,user_id) values ('a','${a}'),('b','${b}');
    end if; end $$;
    insert into public.intake(id,tenant_id,name) values ('${intake}','a','Ana'),('10000000-0000-0000-0000-000000000002','b','Bea');
    insert into public.clients(tenant_id,name) values ('a','Ana'),('b','Bea');`);
    await t.test("member reads only their own tenant", () => {
      assert.match(
        asUser(a, "select string_agg(name, ',') from public.intake"),
        /\nAna\n/,
      );
      assert.doesNotMatch(
        asUser(a, "select string_agg(name, ',') from public.clients"),
        /Bea/,
      );
    });
    await t.test(
      "member cannot alter another tenant or move records to it",
      () => {
        assert.match(
          asUser(
            a,
            "update public.clients set name='stolen' where tenant_id='b'",
          ),
          /UPDATE 0/,
        );
        assert.throws(() =>
          asUser(
            a,
            "update public.intake set tenant_id='b' where tenant_id='a'",
          ),
        );
      },
    );
    await t.test("member cannot truncate every tenant", () => {
      assert.throws(() => asUser(a, "truncate public.clients"));
    });
    await t.test("membership cannot be self granted", () => {
      assert.throws(() =>
        asUser(
          a,
          `insert into public.intake_tenant_members values ('b','${a}')`,
        ),
      );
    });
    await t.test(
      "anonymous users can submit without reading private records",
      () => {
        assert.match(
          run(
            "begin; set local role anon; insert into public.intake(tenant_id,name) values ('a','Public'); rollback;",
          ),
          /INSERT 0 1/,
        );
        assert.throws(() =>
          run(
            "begin; set local role anon; select * from public.intake; rollback;",
          ),
        );
      },
    );
    await t.test("no membership fails closed even with a valid user ID", () => {
      assert.match(
        asUser(
          "00000000-0000-0000-0000-000000000003",
          "select count(*) from public.intake",
        ),
        /\n0\n/,
      );
      assert.throws(() =>
        asUser(
          "00000000-0000-0000-0000-000000000003",
          `select public.convert_intake('${intake}')`,
        ),
      );
    });
    await t.test("failed status update rolls back client creation", () => {
      run(`create function public.fail_done() returns trigger language plpgsql as $$ begin raise exception 'forced update failure'; end $$;
        create trigger fail_done before update on public.intake for each row execute function public.fail_done();`);
      try {
        assert.throws(() =>
          asUser(a, `select public.convert_intake('${intake}')`),
        );
        assert.equal(
          run(
            `select count(*) from public.clients where intake_id='${intake}'`,
          ),
          "0",
        );
        assert.equal(
          run(`select status from public.intake where id='${intake}'`),
          "new",
        );
      } finally {
        run(
          "drop trigger fail_done on public.intake; drop function public.fail_done()",
        );
      }
    });
    await t.test(
      "concurrent conversions create exactly one client",
      async () => {
        const transaction = `begin; set local role authenticated; set local request.jwt.claim.sub = '${a}'; select public.convert_intake('${intake}'); select pg_sleep(0.1); commit;`;
        const results = await Promise.all(
          [1, 2].map(() =>
            promisify(execFile)("psql", [
              database,
              "-XAt",
              "-v",
              "ON_ERROR_STOP=1",
              "-c",
              transaction,
            ]),
          ),
        );
        const ids = results.map(
          ({ stdout }) =>
            stdout.match(/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/)?.[0],
        );
        assert.ok(ids[0]);
        assert.equal(ids[0], ids[1]);
        assert.equal(
          run(
            `select count(*) from public.clients where intake_id='${intake}'`,
          ),
          "1",
        );
        run(
          `delete from public.clients where intake_id='${intake}'; update public.intake set status='new' where id='${intake}'`,
        );
      },
    );
    await t.test(
      "conversion is authorized and retry returns the same client",
      () => {
        assert.throws(() =>
          asUser(b, `select public.convert_intake('${intake}')`),
        );
        const output = asUser(
          a,
          `select public.convert_intake('${intake}'); select public.convert_intake('${intake}'); select count(*) from public.clients where intake_id='${intake}'; select status from public.intake where id='${intake}'`,
        );
        const ids = output.match(/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/g);
        assert.equal(ids?.length, 2);
        assert.equal(ids[0], ids[1]);
        assert.match(output, /\n1\ndone\n/);
      },
    );
  },
);
