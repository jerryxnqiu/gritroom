import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

test("0018 mathematics and writing migration widens subjects and seeds knowledge", () => {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");

  const migrationsDir = new URL("../migrations/", import.meta.url);
  const files = readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  assert.ok(files.includes("0018_mathematics_writing_modules.sql"));

  for (const name of files) {
    if (name > "0018_mathematics_writing_modules.sql") continue;
    assert.doesNotThrow(
      () => sql.exec(readFileSync(new URL(name, migrationsDir), "utf8")),
      `migration ${name} should apply`,
    );
  }

  assert.match(
    String(sql.prepare("SELECT sql FROM sqlite_master WHERE name = 'practice_sessions'").get()?.sql ?? ""),
    /mathematics/,
  );
  assert.match(
    String(sql.prepare("SELECT sql FROM sqlite_master WHERE name = 'learning_evidence'").get()?.sql ?? ""),
    /mathematics_practice_pack/,
  );
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM mathematics_blueprints").get()?.n,
    5,
  );
  assert.equal(
    sql.prepare("SELECT question_count AS n FROM mathematics_sources WHERE exam_goal = 'selective' AND kind = 'format'").get()?.n,
    35,
  );
  assert.equal(
    sql.prepare("SELECT minutes AS n FROM writing_sources WHERE exam_goal = 'selective' AND kind = 'format'").get()?.n,
    30,
  );
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM writing_blueprints").get()?.n,
    3,
  );
  assert.equal(
    sql.prepare("SELECT count(*) AS n FROM writing_sources WHERE exam_goal = 'oc'").get()?.n,
    0,
  );

  assert.doesNotThrow(() => {
    sql.exec(`
      INSERT INTO users(id,email) VALUES ('owner','o@x.invalid');
      INSERT INTO families(id,name,installation_owner_user_id) VALUES ('f1','F','owner');
      INSERT INTO profiles(id,family_id,nickname,exam_goal) VALUES ('p1','f1','Kid','selective');
      INSERT INTO practice_sessions(id,profile_id,exam_goal,mode,status,started_at,subject)
      VALUES ('s1','p1','selective','timed','active',datetime('now'),'mathematics');
      INSERT INTO practice_attempts(
        id,session_id,profile_id,exam_goal,subject,question_prompt,options_json,correct_option,created_at
      ) VALUES (
        'a1','s1','p1','selective','mathematics','Prompt','{"A":"1","B":"2","C":"3","D":"4","E":"5"}','E',datetime('now')
      );
      INSERT INTO mathematics_questions(
        id,version,exam_goal,blueprint_id,prompt,options_json,correct_option,status,created_at
      ) VALUES (
        'mq1',1,'selective','number-sense','Prompt','{"A":"1","B":"2","C":"3","D":"4","E":"5"}','E','active',datetime('now')
      );
      INSERT INTO learning_evidence(id,profile_id,exam_goal,subject,kind,ref_id,summary,created_at)
      VALUES ('e1','p1','selective','mathematics','mathematics_practice_pack','pack1','Bank refreshed',datetime('now'));
      INSERT INTO learning_evidence(id,profile_id,exam_goal,subject,kind,ref_id,summary,created_at)
      VALUES ('e2','p1','selective','writing','parent_feedback','fb1','Writing tip',datetime('now'));
    `);
  });
});
