// BiblioVault seed script — inserts 4 demo user accounts
// Run: node backend/seed_dummy_users.js
// Safe to re-run — uses INSERT OR IGNORE so duplicates are skipped.
// Passwords are hashed with bcryptjs cost 12 before insertion.

import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { initializeDatabase, getDb } from './database.js';

// Initialize database (creates tables if they do not exist)
initializeDatabase();

const db = getDb();

// Hash passwords with bcrypt cost 12
const studentHash   = bcrypt.hashSync('Student@123', 12);
const staffHash     = bcrypt.hashSync('Staff@1234', 12);
const authorHash    = bcrypt.hashSync('Author@1234', 12);
const librarianHash = bcrypt.hashSync('Librarian@1', 12);

const insert = db.prepare(`
  INSERT OR IGNORE INTO users (id, username, full_name, password_hash, role, bio, employee_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

insert.run(uuidv4(), 'student_demo',   'Student Demo',   studentHash,   'student',   null, null);
insert.run(uuidv4(), 'staff_demo',     'Staff Demo',     staffHash,     'staff',     null, null);
insert.run(uuidv4(), 'author_demo',    'Author Demo',    authorHash,    'author',    'Demo author account for testing.', null);
insert.run(uuidv4(), 'librarian_demo', 'Librarian Demo', librarianHash, 'librarian', null, 'EMP-DEMO-001');

console.log('Demo users seeded successfully.');
