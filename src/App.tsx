/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Users, 
  BookOpen, 
  FileSpreadsheet, 
  Calculator, 
  Save, 
  Download,
  ChevronRight,
  Search,
  CheckCircle2,
  AlertCircle,
  Edit2,
  X,
  FileText,
  Trash2,
  Upload
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
type ExamType = '1st Assessment' | 'Mid Term Exam' | '2nd Assessment' | 'Final Exam';

interface Student {
  id: number;
  gr_no: string;
  name: string;
  class: string;
  section: string;
}

interface Subject {
  id: number;
  name: string;
  is_core: number;
}

interface Mark {
  id: number;
  student_id: number;
  subject_id: number;
  exam_type: ExamType;
  marks_obtained: number;
  max_marks: number;
  student_name?: string;
  subject_name?: string;
  is_core?: number;
}

const EXAM_TYPES: ExamType[] = ['1st Assessment', 'Mid Term Exam', '2nd Assessment', 'Final Exam'];

export default function App() {
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [activeTab, setActiveTab] = useState<'students' | 'entry' | 'consolidated'>('students');
  const [selectedExam, setSelectedExam] = useState<ExamType>('1st Assessment');
  const [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [entryMode, setEntryMode] = useState<'marks' | 'grades'>('marks');

  // Form states
  const [currentClass, setCurrentClass] = useState({ class: '', section: '' });
  const [isClassSet, setIsClassSet] = useState(false);
  const [newStudent, setNewStudent] = useState({ gr_no: '', name: '' });
  const [entryData, setEntryData] = useState<Record<number, { obtained: string; max: string }>>({});

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    // Clear entry data when subject or exam changes to prevent cross-contamination
    setEntryData({});
  }, [selectedSubject, selectedExam]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [studentsRes, subjectsRes, marksRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/subjects'),
        fetch('/api/marks')
      ]);
      
      const studentsData = await studentsRes.json();
      const subjectsData = await subjectsRes.json();
      const marksData = await marksRes.json();

      setStudents(studentsData);
      setSubjects(subjectsData);
      setMarks(marksData);
      if (subjectsData.length > 0 && !selectedSubject) setSelectedSubject(subjectsData[0].id);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isClassSet) {
      setMessage({ text: 'Please set Class and Section first', type: 'error' });
      return;
    }
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newStudent,
          class: currentClass.class,
          section: currentClass.section
        })
      });
      if (res.ok) {
        setNewStudent({ gr_no: '', name: '' });
        fetchData();
        setMessage({ text: 'Student added successfully!', type: 'success' });
      } else {
        const err = await res.json();
        setMessage({ text: err.error || 'Failed to add student', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Error connecting to server', type: 'error' });
    }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      const res = await fetch(`/api/students/${editingStudent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingStudent)
      });
      if (res.ok) {
        setEditingStudent(null);
        fetchData();
        setMessage({ text: 'Student updated successfully!', type: 'success' });
      } else {
        const err = await res.json();
        setMessage({ text: err.error || 'Failed to update student', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Error connecting to server', type: 'error' });
    }
  };

  const handleDeleteStudent = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this student? This will also remove all their marks.')) return;
    try {
      console.log('Deleting student:', id);
      const res = await fetch(`/api/students/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setEditingStudent(null);
        await fetchData();
        setMessage({ text: 'Student deleted successfully', type: 'success' });
      } else {
        const err = await res.json();
        setMessage({ text: err.error || 'Failed to delete student', type: 'error' });
      }
    } catch (error) {
      console.error('Delete error:', error);
      setMessage({ text: 'Error connecting to server', type: 'error' });
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        // Expecting columns: gr_no, name, class, section (optional)
        const studentsToImport = data.map(row => ({
          gr_no: row.gr_no || row['G.R. No'] || row['GR No'] || '',
          name: row.name || row['Student Name'] || row['Name'] || '',
          class: row.class || row['Class'] || '',
          section: row.section || row['Section'] || ''
        })).filter(s => s.gr_no && s.name && s.class);

        if (studentsToImport.length === 0) {
          setMessage({ text: 'No valid student data found in CSV', type: 'error' });
          return;
        }

        const res = await fetch('/api/students/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ students: studentsToImport })
        });

        if (res.ok) {
          fetchData();
          setMessage({ text: `Successfully imported ${studentsToImport.length} students!`, type: 'success' });
        } else {
          setMessage({ text: 'Failed to import students', type: 'error' });
        }
      } catch (error) {
        setMessage({ text: 'Error parsing CSV file', type: 'error' });
      }
    };
    reader.readAsBinaryString(file);
    // Reset input
    e.target.value = '';
  };

  const handleSaveMarks = async () => {
    if (!selectedSubject) return;
    setSaving(true);
    const entries = Object.entries(entryData).map(([studentId, data]) => ({
      student_id: parseInt(studentId),
      subject_id: selectedSubject,
      exam_type: selectedExam,
      marks_obtained: parseFloat((data as { obtained: string; max: string }).obtained) || 0,
      max_marks: parseFloat((data as { obtained: string; max: string }).max) || 100
    }));

    try {
      const res = await fetch('/api/marks/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries })
      });
      if (res.ok) {
        fetchData();
        setMessage({ text: 'Marks saved successfully!', type: 'success' });
      }
    } catch (error) {
      setMessage({ text: 'Failed to save marks', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const consolidatedData = useMemo(() => {
    const result: Record<number, Record<number, { 
      '1st Assessment': number;
      'Mid Term Exam': number;
      '2nd Assessment': number;
      'Final Exam': number;
      total: number;
    }>> = {};

    students.forEach(student => {
      result[student.id] = {};
      subjects.forEach(subject => {
        result[student.id][subject.id] = {
          '1st Assessment': 0,
          'Mid Term Exam': 0,
          '2nd Assessment': 0,
          'Final Exam': 0,
          total: 0
        };
      });
    });

    marks.forEach(mark => {
      if (result[mark.student_id] && result[mark.student_id][mark.subject_id]) {
        result[mark.student_id][mark.subject_id][mark.exam_type] = mark.marks_obtained;
      }
    });

    // Calculate totals based on user's formula: 10%, 50%, 10%, 50%
    Object.keys(result).forEach(sId => {
      const studentId = parseInt(sId);
      Object.keys(result[studentId]).forEach(subId => {
        const subjectId = parseInt(subId);
        const data = result[studentId][subjectId];
        data.total = (data['1st Assessment'] * 0.1) + 
                     (data['Mid Term Exam'] * 0.5) + 
                     (data['2nd Assessment'] * 0.1) + 
                     (data['Final Exam'] * 0.5);
      });
    });

    return result;
  }, [students, subjects, marks]);

  const exportToExcel = () => {
    const exportData: any[] = [];
    
    students.forEach(student => {
      subjects.forEach(subject => {
        const data = consolidatedData[student.id][subject.id];
        exportData.push({
          'G.R. No': student.gr_no,
          'Student Name': student.name,
          'Class': student.class,
          'Section': student.section,
          'Subject': subject.name,
          'Type': subject.is_core ? 'Core' : 'Non-Core',
          '1st Assessment (10%)': data['1st Assessment'],
          'Mid Term (50%)': data['Mid Term Exam'],
          '2nd Assessment (10%)': data['2nd Assessment'],
          'Final Exam (50%)': data['Final Exam'],
          'Consolidated Total': data.total.toFixed(2)
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consolidated Result");
    XLSX.writeFile(wb, "Student_Results.xlsx");
  };

  const exportSubjectToExcel = () => {
    if (!selectedSubject) return;
    const subject = subjects.find(s => s.id === selectedSubject);
    const exportData = students.map(student => {
      const existingMark = marks.find(m => m.student_id === student.id && m.subject_id === selectedSubject && m.exam_type === selectedExam);
      return {
        'G.R. No': student.gr_no,
        'Student Name': student.name,
        'Class': student.class,
        'Section': student.section,
        'Subject': subject?.name,
        'Exam': selectedExam,
        'Obtained': existingMark?.marks_obtained || 0,
        'Max': existingMark?.max_marks || 100
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${subject?.name}_${selectedExam}`);
    XLSX.writeFile(wb, `${subject?.name}_${selectedExam}_Results.xlsx`);
  };

  const exportExamResultSheet = (examType: ExamType = selectedExam) => {
    const exportData: any[] = [];
    students.forEach(student => {
      const studentRow: any = {
        'G.R. No': student.gr_no,
        'Name': student.name,
        'Class': student.class,
        'Section': student.section,
      };
      
      let totalObtained = 0;
      let totalMax = 0;

      subjects.forEach(subject => {
        const mark = marks.find(m => m.student_id === student.id && m.subject_id === subject.id && m.exam_type === examType);
        studentRow[subject.name] = mark?.marks_obtained || 0;
        totalObtained += mark?.marks_obtained || 0;
        totalMax += mark?.max_marks || 100;
      });

      studentRow['Total Obtained'] = totalObtained;
      studentRow['Total Max'] = totalMax;
      studentRow['Percentage'] = ((totalObtained / totalMax) * 100).toFixed(2) + '%';
      
      exportData.push(studentRow);
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${examType}_Result_Sheet`);
    XLSX.writeFile(wb, `${examType}_Result_Sheet.xlsx`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center font-sans">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#141414] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-mono text-sm uppercase tracking-widest">Initializing System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#E4E3E0] border-b border-[#141414] z-[60] flex items-center justify-between px-6">
        <h1 className="font-serif italic text-xl">Result System</h1>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 border border-[#141414]"
        >
          {isSidebarOpen ? <Plus className="rotate-45" /> : <Users />}
        </button>
      </div>

      {/* Sidebar / Navigation */}
      <nav className={cn(
        "fixed left-0 top-0 h-full w-64 border-r border-[#141414] bg-[#E4E3E0] z-50 p-6 flex flex-col transition-transform duration-300 lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="mb-12 hidden lg:block">
          <h1 className="font-serif italic text-2xl leading-tight mb-1">Result<br/>System</h1>
          <p className="font-mono text-[10px] uppercase opacity-50 tracking-tighter">Academic Management v1.0</p>
        </div>

        <div className="space-y-2 flex-grow mt-20 lg:mt-0">
          <button 
            onClick={() => { setActiveTab('students'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full text-left px-4 py-3 flex items-center gap-3 transition-all duration-200 group",
              activeTab === 'students' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5"
            )}
          >
            <Users size={18} />
            <span className="text-sm font-medium">Students</span>
            <ChevronRight size={14} className={cn("ml-auto opacity-0 group-hover:opacity-100 transition-opacity", activeTab === 'students' && "opacity-100")} />
          </button>
          
          <button 
            onClick={() => { setActiveTab('entry'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full text-left px-4 py-3 flex items-center gap-3 transition-all duration-200 group",
              activeTab === 'entry' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5"
            )}
          >
            <BookOpen size={18} />
            <span className="text-sm font-medium">Marks Entry</span>
            <ChevronRight size={14} className={cn("ml-auto opacity-0 group-hover:opacity-100 transition-opacity", activeTab === 'entry' && "opacity-100")} />
          </button>

          <button 
            onClick={() => { setActiveTab('consolidated'); setIsSidebarOpen(false); }}
            className={cn(
              "w-full text-left px-4 py-3 flex items-center gap-3 transition-all duration-200 group",
              activeTab === 'consolidated' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5"
            )}
          >
            <Calculator size={18} />
            <span className="text-sm font-medium">Consolidated</span>
            <ChevronRight size={14} className={cn("ml-auto opacity-0 group-hover:opacity-100 transition-opacity", activeTab === 'consolidated' && "opacity-100")} />
          </button>
        </div>

        <div className="mt-auto pt-6 border-t border-[#141414]/20">
          <button 
            onClick={exportToExcel}
            className="w-full bg-[#141414] text-[#E4E3E0] px-4 py-4 flex items-center justify-center gap-2 hover:bg-[#141414]/90 transition-colors"
          >
            <Download size={18} />
            <span className="text-xs font-bold uppercase tracking-widest">Export Excel</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="lg:ml-64 p-6 lg:p-12 pt-24 lg:pt-12 max-w-7xl">
        {message && (
          <div className={cn(
            "fixed top-20 lg:top-6 right-6 px-6 py-4 flex items-center gap-3 z-[100] animate-in slide-in-from-right shadow-lg",
            message.type === 'success' ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
          )}>
            {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span className="text-sm font-medium">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-4 opacity-50 hover:opacity-100">×</button>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="space-y-8 lg:space-y-12">
            <header>
              <h2 className="font-serif italic text-3xl lg:text-5xl mb-4">Student Registry</h2>
              <p className="text-[#141414]/60 max-w-xl text-sm lg:text-base">Manage student profiles. Set class/section once, then add multiple students.</p>
            </header>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
              {/* Add Student Form */}
              <div className="lg:col-span-1">
                <div className="border border-[#141414] p-6 lg:p-8 space-y-6">
                  {!isClassSet ? (
                    <div className="space-y-6">
                      <h3 className="font-mono text-[10px] uppercase tracking-widest opacity-50">Step 1: Set Class Info</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold tracking-tighter">Class</label>
                          <input 
                            value={currentClass.class}
                            onChange={e => setCurrentClass({...currentClass, class: e.target.value})}
                            className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-mono text-sm"
                            placeholder="Grade"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold tracking-tighter">Section</label>
                          <input 
                            value={currentClass.section}
                            onChange={e => setCurrentClass({...currentClass, section: e.target.value})}
                            className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-mono text-sm"
                            placeholder="A/B/C"
                          />
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          if (currentClass.class && currentClass.section) setIsClassSet(true);
                          else setMessage({ text: 'Please fill all fields', type: 'error' });
                        }}
                        className="w-full bg-[#141414] text-[#E4E3E0] py-4 text-xs font-bold uppercase tracking-widest hover:bg-[#141414]/90 transition-all"
                      >
                        Set Class & Section
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="font-mono text-[10px] uppercase tracking-widest opacity-50">Step 2: Add Students</h3>
                        <button 
                          onClick={() => setIsClassSet(false)}
                          className="text-[10px] uppercase font-bold tracking-tighter underline opacity-50 hover:opacity-100"
                        >
                          Change Class ({currentClass.class}-{currentClass.section})
                        </button>
                      </div>
                      <form onSubmit={handleAddStudent} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold tracking-tighter">G.R. Number</label>
                          <input 
                            required
                            value={newStudent.gr_no}
                            onChange={e => setNewStudent({...newStudent, gr_no: e.target.value})}
                            className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-mono text-sm"
                            placeholder="e.g. 2024-001"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase font-bold tracking-tighter">Full Name</label>
                          <input 
                            required
                            value={newStudent.name}
                            onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                            className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-mono text-sm"
                            placeholder="Student Name"
                          />
                        </div>
                        <button type="submit" className="w-full bg-[#141414] text-[#E4E3E0] py-4 flex items-center justify-center gap-2 hover:bg-[#141414]/90 transition-all mt-4">
                          <Plus size={18} />
                          <span className="text-xs font-bold uppercase tracking-widest">Add to {currentClass.class}-{currentClass.section}</span>
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>

              {/* Student List */}
              <div className="lg:col-span-2">
                <div className="flex justify-end mb-4">
                  <label className="cursor-pointer bg-transparent border border-[#141414] px-4 py-2 flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all group">
                    <Upload size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Import CSV</span>
                    <input 
                      type="file" 
                      accept=".csv,.xlsx,.xls" 
                      className="hidden" 
                      onChange={handleImportCSV}
                    />
                  </label>
                </div>
                <div className="border border-[#141414] overflow-x-auto">
                  <div className="min-w-[500px]">
                    <div className="grid grid-cols-4 p-4 border-b border-[#141414] bg-[#141414] text-[#E4E3E0]">
                      <span className="font-mono text-[10px] uppercase tracking-widest">G.R. No</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest">Name</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest">Class</span>
                      <span className="font-mono text-[10px] uppercase tracking-widest">Section</span>
                    </div>
                    <div className="max-h-[600px] overflow-y-auto">
                      {students.length === 0 ? (
                        <div className="p-12 text-center opacity-30 italic">No students registered yet.</div>
                      ) : (
                        students.map(student => (
                          <div 
                            key={student.id} 
                            onClick={() => setEditingStudent(student)}
                            className="grid grid-cols-4 p-4 border-b border-[#141414] hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group cursor-pointer"
                          >
                            <span className="font-mono text-sm">{student.gr_no}</span>
                            <span className="font-medium flex items-center gap-2">
                              {student.name}
                              <Edit2 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </span>
                            <span className="font-mono text-sm">{student.class}</span>
                            <span className="font-mono text-sm">{student.section}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Edit Student Modal */}
        {editingStudent && (
          <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
            <div className="bg-[#E4E3E0] border border-[#141414] w-full max-w-md p-8 relative animate-in zoom-in-95 duration-200">
              <button 
                onClick={() => setEditingStudent(null)}
                className="absolute top-4 right-4 p-2 hover:bg-[#141414]/5 transition-colors"
              >
                <X size={20} />
              </button>
              
              <h3 className="font-serif italic text-3xl mb-6">Edit Student</h3>
              
              <form onSubmit={handleUpdateStudent} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tighter">G.R. Number</label>
                  <input 
                    required
                    value={editingStudent.gr_no}
                    onChange={e => setEditingStudent({...editingStudent, gr_no: e.target.value})}
                    className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tighter">Full Name</label>
                  <input 
                    required
                    value={editingStudent.name}
                    onChange={e => setEditingStudent({...editingStudent, name: e.target.value})}
                    className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-tighter">Class</label>
                    <input 
                      required
                      value={editingStudent.class}
                      onChange={e => setEditingStudent({...editingStudent, class: e.target.value})}
                      className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-tighter">Section</label>
                    <input 
                      required
                      value={editingStudent.section}
                      onChange={e => setEditingStudent({...editingStudent, section: e.target.value})}
                      className="w-full bg-transparent border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="pt-4 space-y-3">
                  <div className="flex gap-4">
                    <button 
                      type="button"
                      onClick={() => setEditingStudent(null)}
                      className="flex-1 border border-[#141414] py-4 text-xs font-bold uppercase tracking-widest hover:bg-[#141414]/5 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 bg-[#141414] text-[#E4E3E0] py-4 text-xs font-bold uppercase tracking-widest hover:bg-[#141414]/90 transition-all"
                    >
                      Save Changes
                    </button>
                  </div>
                  <button 
                    type="button"
                    onClick={() => handleDeleteStudent(editingStudent.id)}
                    className="w-full border border-rose-600 text-rose-600 py-3 text-[10px] font-bold uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all flex items-center justify-center gap-2"
                  >
                    <Trash2 size={14} />
                    Delete Student
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'entry' && (
          <div className="space-y-8 lg:space-y-12">
            <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div>
                <h2 className="font-serif italic text-3xl lg:text-5xl mb-4">Marks Entry</h2>
                <p className="text-[#141414]/60 max-w-xl text-sm lg:text-base">Select examination and subject to record student performance data.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tighter block">Entry Mode</label>
                  <div className="flex border border-[#141414]">
                    <button 
                      onClick={() => setEntryMode('marks')}
                      className={cn("px-4 py-2 text-[10px] uppercase font-bold tracking-widest transition-colors", entryMode === 'marks' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5")}
                    >
                      Marks
                    </button>
                    <button 
                      onClick={() => setEntryMode('grades')}
                      className={cn("px-4 py-2 text-[10px] uppercase font-bold tracking-widest transition-colors", entryMode === 'grades' ? "bg-[#141414] text-[#E4E3E0]" : "hover:bg-[#141414]/5")}
                    >
                      Grades
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tighter block">Examination</label>
                  <select 
                    value={selectedExam}
                    onChange={e => setSelectedExam(e.target.value as ExamType)}
                    className="w-full bg-transparent border border-[#141414] px-4 py-2 font-mono text-xs focus:outline-none"
                  >
                    {EXAM_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-tighter block">Subject</label>
                  <select 
                    value={selectedSubject || ''}
                    onChange={e => setSelectedSubject(parseInt(e.target.value))}
                    className="w-full bg-transparent border border-[#141414] px-4 py-2 font-mono text-xs focus:outline-none"
                  >
                    {subjects.map(sub => <option key={sub.id} value={sub.id}>{sub.name} ({sub.is_core ? 'Core' : 'Non-Core'})</option>)}
                  </select>
                </div>
              </div>
            </header>

            <div className="border border-[#141414] overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-12 p-4 border-b border-[#141414] bg-[#141414] text-[#E4E3E0] items-center">
                  <span className="col-span-2 font-mono text-[10px] uppercase tracking-widest">G.R. No</span>
                  <span className="col-span-4 font-mono text-[10px] uppercase tracking-widest">Student Name</span>
                  <span className="col-span-3 font-mono text-[10px] uppercase tracking-widest text-center">{entryMode === 'marks' ? 'Obtained Marks' : 'Grade'}</span>
                  <span className="col-span-3 font-mono text-[10px] uppercase tracking-widest text-center">{entryMode === 'marks' ? 'Max Marks' : 'Points'}</span>
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {students.map(student => {
                    const existingMark = marks.find(m => m.student_id === student.id && m.subject_id === selectedSubject && m.exam_type === selectedExam);
                    return (
                      <div key={student.id} className="grid grid-cols-12 p-4 border-b border-[#141414] items-center hover:bg-[#141414]/5 transition-colors">
                        <span className="col-span-2 font-mono text-sm">{student.gr_no}</span>
                        <span className="col-span-4 font-medium">{student.name}</span>
                        <div className="col-span-3 px-8">
                          <input 
                            type={entryMode === 'marks' ? "number" : "text"}
                            defaultValue={existingMark?.marks_obtained || ''}
                            onChange={e => setEntryData({
                              ...entryData,
                              [student.id]: { 
                                obtained: e.target.value, 
                                max: entryData[student.id]?.max || existingMark?.max_marks.toString() || '100' 
                              }
                            })}
                            className="w-full bg-transparent border-b border-[#141414] text-center py-1 font-mono focus:outline-none"
                            placeholder={entryMode === 'marks' ? "0.00" : "Grade"}
                          />
                        </div>
                        <div className="col-span-3 px-8">
                          <input 
                            type="number"
                            defaultValue={existingMark?.max_marks || '100'}
                            onChange={e => setEntryData({
                              ...entryData,
                              [student.id]: { 
                                obtained: entryData[student.id]?.obtained || existingMark?.marks_obtained.toString() || '0', 
                                max: e.target.value 
                              }
                            })}
                            className="w-full bg-transparent border-b border-[#141414] text-center py-1 font-mono focus:outline-none"
                            placeholder="100"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="p-6 lg:p-8 bg-[#141414]/5 flex flex-col sm:flex-row justify-between gap-4">
                <button 
                  onClick={exportSubjectToExcel}
                  className="bg-transparent border border-[#141414] px-8 py-4 flex items-center justify-center gap-3 hover:bg-[#141414]/5 transition-all"
                >
                  <FileSpreadsheet size={18} />
                  <span className="text-xs font-bold uppercase tracking-widest">Download Subject Sheet</span>
                </button>
                <button 
                  onClick={handleSaveMarks}
                  disabled={saving}
                  className="w-full sm:w-auto bg-[#141414] text-[#E4E3E0] px-8 py-4 flex items-center justify-center gap-3 hover:bg-[#141414]/90 transition-all disabled:opacity-50"
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save size={18} />}
                  <span className="text-xs font-bold uppercase tracking-widest">Commit Changes</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'consolidated' && (
          <div className="space-y-8 lg:space-y-12">
            <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div>
                <h2 className="font-serif italic text-3xl lg:text-5xl mb-4">Consolidated Report</h2>
                <p className="text-[#141414]/60 max-w-xl text-sm lg:text-base">Weighted performance analysis (10% Assessments, 50% Exams) across all subjects.</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={exportToExcel}
                  className="px-4 py-2 bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase flex items-center gap-2 hover:bg-[#141414]/90 transition-all"
                >
                  <FileSpreadsheet size={14} />
                  Export Consolidated (All Exams)
                </button>
                
                <div className="flex border border-[#141414]">
                  <select 
                    id="export-exam-select"
                    className="bg-transparent px-3 py-2 font-mono text-[10px] uppercase focus:outline-none border-r border-[#141414]"
                    defaultValue={selectedExam}
                    onChange={(e) => {
                      const btn = document.getElementById('export-exam-btn') as HTMLButtonElement;
                      if (btn) btn.dataset.exam = e.target.value;
                    }}
                  >
                    {EXAM_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <button 
                    id="export-exam-btn"
                    data-exam={selectedExam}
                    onClick={(e) => exportExamResultSheet(e.currentTarget.dataset.exam as ExamType)}
                    className="px-4 py-2 font-mono text-[10px] uppercase flex items-center gap-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
                  >
                    <FileText size={14} />
                    Download Full Sheet
                  </button>
                </div>

                <div className="px-4 py-2 border border-[#141414] font-mono text-[10px] uppercase flex items-center">
                  Weighting: 10/50/10/50
                </div>
              </div>
            </header>

            <div className="overflow-x-auto border border-[#141414]">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-[#141414] text-[#E4E3E0]">
                    <th className="p-4 font-mono text-[10px] uppercase tracking-widest border-r border-[#E4E3E0]/20">Student Info</th>
                    {subjects.map(sub => (
                      <th key={sub.id} className="p-4 font-mono text-[10px] uppercase tracking-widest text-center border-r border-[#E4E3E0]/20 min-w-[150px]">
                        {sub.name}
                        <div className="text-[8px] opacity-50 mt-1">{sub.is_core ? 'CORE' : 'NON-CORE'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map(student => (
                    <tr key={student.id} className="border-b border-[#141414] hover:bg-[#141414]/5 transition-colors">
                      <td className="p-4 border-r border-[#141414]">
                        <div className="font-bold text-sm">{student.name}</div>
                        <div className="font-mono text-[10px] opacity-50">{student.gr_no} • {student.class}-{student.section}</div>
                      </td>
                      {subjects.map(subject => {
                        const data = consolidatedData[student.id][subject.id];
                        return (
                          <td key={subject.id} className="p-4 border-r border-[#141414] text-center">
                            <div className="font-mono text-lg font-bold">{data.total.toFixed(1)}</div>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
                              <div className="text-[8px] uppercase opacity-40 text-left">1st: {data['1st Assessment']}</div>
                              <div className="text-[8px] uppercase opacity-40 text-right">Mid: {data['Mid Term Exam']}</div>
                              <div className="text-[8px] uppercase opacity-40 text-left">2nd: {data['2nd Assessment']}</div>
                              <div className="text-[8px] uppercase opacity-40 text-right">Fin: {data['Final Exam']}</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
