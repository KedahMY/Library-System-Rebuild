import { db, initializeDatabase } from './database.js';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

// Ensure tables exist before seeding
initializeDatabase();

const users = [
  { username: 'student_demo',  password: 'Student@123',  full_name: 'Student Demo',  role: 'student',  bio: null,           employee_id: null },
  { username: 'staff_demo',    password: 'Staff@1234',   full_name: 'Staff Demo',    role: 'staff',    bio: null,           employee_id: null },
  { username: 'author_demo',   password: 'Author@1234',  full_name: 'Author Demo',   role: 'author',   bio: 'Demo author account for testing.', employee_id: null },
  { username: 'librarian_demo',password: 'Librarian@1',  full_name: 'Librarian Demo',role: 'librarian',bio: null,           employee_id: 'EMP-DEMO-001' },
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO users (id, username, full_name, password_hash, role, bio, employee_id)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 12);
  insert.run(randomUUID(), u.username, u.full_name, hash, u.role, u.bio, u.employee_id);
}

console.log('4 demo users seeded (or already exist).');
