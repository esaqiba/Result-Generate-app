import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("results.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gr_no TEXT UNIQUE,
    name TEXT,
    class TEXT,
    section TEXT
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    is_core INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER,
    subject_id INTEGER,
    exam_type TEXT,
    marks_obtained REAL,
    max_marks REAL,
    FOREIGN KEY(student_id) REFERENCES students(id),
    FOREIGN KEY(subject_id) REFERENCES subjects(id)
  );
`);

// Seed default subjects if empty
const subjectCount = db.prepare("SELECT COUNT(*) as count FROM subjects").get() as { count: number };
if (subjectCount.count === 0) {
  const insertSubject = db.prepare("INSERT INTO subjects (name, is_core) VALUES (?, ?)");
  const coreSubjects = ["Mathematics", "General Science", "English", "Urdu"];
  const nonCoreSubjects = ["Computer", "Social studies", "Art", "Sindhi", "Islamiat", "Quran Nazra"];
  
  coreSubjects.forEach(name => insertSubject.run(name, 1));
  nonCoreSubjects.forEach(name => insertSubject.run(name, 0));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/students", (req, res) => {
    const students = db.prepare("SELECT * FROM students").all();
    res.json(students);
  });

  app.post("/api/students", (req, res) => {
    const { gr_no, name, class: className, section } = req.body;
    try {
      const info = db.prepare("INSERT INTO students (gr_no, name, class, section) VALUES (?, ?, ?, ?)").run(gr_no, name, className, section);
      res.json({ id: info.lastInsertRowid });
    } catch (err) {
      res.status(400).json({ error: "Student with this G.R. No already exists" });
    }
  });

  app.post("/api/students/bulk", (req, res) => {
    const { students } = req.body;
    const insert = db.prepare("INSERT INTO students (gr_no, name, class, section) VALUES (?, ?, ?, ?)");
    const check = db.prepare("SELECT id FROM students WHERE gr_no = ?");

    try {
      const transaction = db.transaction((data) => {
        for (const student of data) {
          const existing = check.get(student.gr_no);
          if (!existing) {
            insert.run(student.gr_no, student.name, student.class, student.section || "");
          }
        }
      });
      transaction(students);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to import students" });
    }
  });

  app.put("/api/students/:id", (req, res) => {
    const { id } = req.params;
    const { gr_no, name, class: className, section } = req.body;
    try {
      db.prepare("UPDATE students SET gr_no = ?, name = ?, class = ?, section = ? WHERE id = ?")
        .run(gr_no, name, className, section, id);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: "Update failed. G.R. No might be duplicate." });
    }
  });

  app.delete("/api/students/:id", (req, res) => {
    const { id } = req.params;
    console.log(`Attempting to delete student with ID: ${id}`);
    try {
      const deleteMarks = db.prepare("DELETE FROM marks WHERE student_id = ?");
      const deleteStudent = db.prepare("DELETE FROM students WHERE id = ?");
      
      const transaction = db.transaction(() => {
        const marksResult = deleteMarks.run(id);
        const studentResult = deleteStudent.run(id);
        console.log(`Deleted ${marksResult.changes} marks and ${studentResult.changes} student record.`);
      });
      
      transaction();
      res.json({ success: true });
    } catch (err) {
      console.error('Database delete error:', err);
      res.status(500).json({ error: "Failed to delete student" });
    }
  });

  app.get("/api/subjects", (req, res) => {
    const subjects = db.prepare("SELECT * FROM subjects").all();
    res.json(subjects);
  });

  app.get("/api/marks", (req, res) => {
    const marks = db.prepare(`
      SELECT m.*, s.name as student_name, sub.name as subject_name, sub.is_core
      FROM marks m
      JOIN students s ON m.student_id = s.id
      JOIN subjects sub ON m.subject_id = sub.id
    `).all();
    res.json(marks);
  });

  app.post("/api/marks", (req, res) => {
    const { student_id, subject_id, exam_type, marks_obtained, max_marks } = req.body;
    const existing = db.prepare("SELECT id FROM marks WHERE student_id = ? AND subject_id = ? AND exam_type = ?").get(student_id, subject_id, exam_type) as { id: number } | undefined;
    
    if (existing) {
      db.prepare("UPDATE marks SET marks_obtained = ?, max_marks = ? WHERE id = ?").run(marks_obtained, max_marks, existing.id);
    } else {
      db.prepare("INSERT INTO marks (student_id, subject_id, exam_type, marks_obtained, max_marks) VALUES (?, ?, ?, ?, ?)").run(student_id, subject_id, exam_type, marks_obtained, max_marks);
    }
    res.json({ success: true });
  });

  app.post("/api/marks/bulk", (req, res) => {
    const { entries } = req.body; // Array of { student_id, subject_id, exam_type, marks_obtained, max_marks }
    const insert = db.prepare("INSERT INTO marks (student_id, subject_id, exam_type, marks_obtained, max_marks) VALUES (?, ?, ?, ?, ?)");
    const update = db.prepare("UPDATE marks SET marks_obtained = ?, max_marks = ? WHERE student_id = ? AND subject_id = ? AND exam_type = ?");
    const check = db.prepare("SELECT id FROM marks WHERE student_id = ? AND subject_id = ? AND exam_type = ?");

    const transaction = db.transaction((data) => {
      for (const entry of data) {
        const existing = check.get(entry.student_id, entry.subject_id, entry.exam_type);
        if (existing) {
          update.run(entry.marks_obtained, entry.max_marks, entry.student_id, entry.subject_id, entry.exam_type);
        } else {
          insert.run(entry.student_id, entry.subject_id, entry.exam_type, entry.marks_obtained, entry.max_marks);
        }
      }
    });

    transaction(entries);
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
