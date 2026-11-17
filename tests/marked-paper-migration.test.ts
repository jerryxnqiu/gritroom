import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("0019 marked_paper shelf migration widens kind CHECK", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");

  const migrationsDir = new URL("../migrations/", import.meta.url);
  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  assert.ok(files.includes("0019_marked_paper_shelf.sql"));

  for (const name of files) {
    if (name > "0019_marked_paper_shelf.sql") continue;
    assert.doesNotThrow(
      () => sql.exec(readFileSync(new URL(name, migrationsDir), "utf8")),
      `migration ${name} should apply`,
    );
  }

  assert.match(
    String(sql.prepare("SELECT sql FROM sqlite_master WHERE name = 'shelf_materials'").get()?.sql ?? ""),
    /marked_paper/,
  );

  assert.doesNotThrow(() => {
    sql.exec(`
      INSERT INTO users(id,email) VALUES ('owner','o@x.invalid');
      INSERT INTO families(id,name,installation_owner_user_id) VALUES ('f1','F','owner');
      INSERT INTO profiles(id,family_id,nickname,exam_goal) VALUES ('p1','f1','Kid','selective');
      INSERT INTO shelf_materials(
        id,profile_id,exam_goal,kind,title,notes,created_by_user_id,created_at,subject
      ) VALUES (
        'm1','p1','selective','marked_paper','NSW Reading PT1 · page 1 of 2',
        'Paper set: NSW Reading PT1 marked\nPage: 1 of 2\n30/38','owner',datetime('now'),'reading'
      );
    `);
  });
  assert.equal(sql.prepare("SELECT kind AS k FROM shelf_materials WHERE id = 'm1'").get()?.k, "marked_paper");
});
