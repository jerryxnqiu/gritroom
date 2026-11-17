import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("0017 coach migration rebuilds under foreign-key enforcement", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  sql.exec(readFileSync(new URL("../migrations/0002_core_schema.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../migrations/0003_family_invitations.sql", import.meta.url), "utf8"));
  sql.exec(`
    INSERT INTO users(id,email) VALUES ('owner','o@x.invalid'),('learner','l@x.invalid');
    INSERT INTO families(id,name,installation_owner_user_id) VALUES ('f1','F','owner');
    INSERT INTO profiles(id,family_id,nickname,exam_goal) VALUES ('p1','f1','Kid','selective');
    INSERT INTO guardian_grants(id,family_id,user_id,profile_id,role) VALUES ('g1','f1','owner',NULL,'owner');
    INSERT INTO family_invites(
      id,family_id,email,role,profile_id,token_hash,expires_at,accepted_at,accepted_by_user_id,created_by_user_id,delivery_status
    ) VALUES (
      'inv1','f1','l@x.invalid','learner','p1','h',datetime('now','+1 day'),datetime('now'),'learner','owner','sent'
    );
    INSERT INTO learner_links(profile_id,user_id,invite_id,linked_at)
    VALUES ('p1','learner','inv1',datetime('now'));
    INSERT INTO login_sessions(id,user_id,entry,token_hash,profile_id,family_id,expires_at)
    VALUES ('s1','owner','parent','tok','p1','f1',datetime('now','+1 day'));
  `);

  assert.doesNotThrow(() => {
    sql.exec(readFileSync(new URL("../migrations/0017_coach_access.sql", import.meta.url), "utf8"));
  });

  assert.equal(sql.prepare("SELECT count(*) AS n FROM learner_links").get()?.n, 1);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM coach_links").get()?.n, 0);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM login_sessions").get()?.n, 1);
  assert.match(
    String(sql.prepare("SELECT sql FROM sqlite_master WHERE name = 'family_invites'").get()?.sql ?? ""),
    /coach/,
  );
});
