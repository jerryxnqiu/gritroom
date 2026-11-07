import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasLearnerInvitation, isInstallationOwner, linkedLearner, listManagedFamilies, listParentProfiles } from "../lib/family.ts";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../migrations/0002_core_schema.sql", import.meta.url), "utf8"));
  sql.exec(`
    INSERT INTO users(id,email) VALUES
      ('owner','owner@example.invalid'), ('guardian','guardian@example.invalid'),
      ('other','other@example.invalid'), ('learner','learner@example.invalid');
    INSERT INTO families(id,name,installation_owner_user_id) VALUES
      ('f1','First family','owner'), ('f2','Other family','other');
    INSERT INTO profiles(id,family_id,nickname,exam_goal) VALUES
      ('p1','f1','First child','selective'), ('p2','f1','Second child','oc'),
      ('p3','f2','Other child','selective');
    INSERT INTO guardian_grants(id,family_id,user_id,profile_id,role) VALUES
      ('g1','f1','owner',NULL,'owner'), ('g2','f1','guardian','p1','guardian'),
      ('g3','f2','other',NULL,'owner'), ('g4','f2','guardian',NULL,'guardian');
    INSERT INTO family_invites(id,family_id,email,role,profile_id,token_hash,expires_at,created_by_user_id) VALUES
      ('i1','f1','learner@example.invalid','learner','p1','fixture',datetime('now','+1 day'),'owner');
  `);
  const db = {
    prepare(query: string) {
      return {
        bind(...values: string[]) {
          const statement = sql.prepare(query);
          return {
            all: async () => ({ results: statement.all(...values) }),
            first: async () => statement.get(...values) ?? null,
          };
        },
      };
    },
  } as unknown as D1Database;
  return { sql, db };
}

test("a per-child guardian grant does not extend to siblings or another family", async () => {
  const { sql, db } = fixture();
  try {
    assert.deepEqual((await listParentProfiles(db, "owner")).map((profile) => profile.id), ["p1", "p2"]);
    assert.deepEqual((await listParentProfiles(db, "guardian")).map((profile) => [profile.id, profile.canManage]), [["p1", 0]]);
    assert.deepEqual(await listManagedFamilies(db, "guardian"), []);
    sql.exec("UPDATE guardian_grants SET revoked_at = datetime('now') WHERE id = 'g2'");
    assert.deepEqual(await listParentProfiles(db, "guardian"), []);
  } finally {
    sql.close();
  }
});

test("an exact verified mailbox still needs an accepted, same-family learner invitation", async () => {
  const { sql, db } = fixture();
  try {
    assert.equal(await hasLearnerInvitation(db, "learner@example.invalid"), true);
    assert.equal(await linkedLearner(db, "learner@example.invalid"), null);
    sql.exec("UPDATE family_invites SET accepted_at = datetime('now'), expires_at = datetime('now','-1 day') WHERE id = 'i1'");
    assert.equal((await linkedLearner(db, "learner@example.invalid"))?.id, "p1");
    assert.equal(await linkedLearner(db, "other@example.invalid"), null);
    sql.exec("UPDATE family_invites SET family_id = 'f2' WHERE id = 'i1'");
    assert.equal(await linkedLearner(db, "learner@example.invalid"), null);
  } finally {
    sql.close();
  }
});

test("creating another family does not grant access to installation mail tools", async () => {
  const { sql, db } = fixture();
  try {
    assert.equal(await isInstallationOwner(db, "owner"), false);
    sql.exec(`INSERT INTO settings(key, value_json) VALUES ('installation_owner_user_id','"owner"')`);
    assert.equal(await isInstallationOwner(db, "owner"), true);
    assert.equal(await isInstallationOwner(db, "other"), false);
  } finally {
    sql.close();
  }
});
