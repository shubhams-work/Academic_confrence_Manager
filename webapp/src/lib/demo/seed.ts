// Fills a DemoStore with realistic sample data covering every state the app
// shows: assigned / unassigned papers, submitted / draft / missing scores,
// missing review scores, signed-up and not-signed-up panel members.
// Port of ../lib/demo/demo_data.dart — keep the data identical.

import type { AppRole, Author } from '../types';
import { DemoStore, type DPanel, type DProfile } from './store';

/** Local wall-clock time as a naive ISO string (no timezone suffix). */
function localIso(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function seedDemoStore(): DemoStore {
  const s = new DemoStore();

  // ---- Tracks & criteria (same as the database seed) ----
  s.tracks.push(
    { id: 1, name: 'Computing', finalizedAt: null },
    { id: 2, name: 'Semiconductor', finalizedAt: null },
    { id: 3, name: 'Mechatronics', finalizedAt: null },
    { id: 4, name: 'Intelligent Systems', finalizedAt: null },
    { id: 5, name: 'Communications', finalizedAt: null },
  );
  s.criteria.push(
    { id: 1, code: 'technical', name: 'Technical Content & Depth', maxMarks: 10 },
    { id: 2, code: 'originality', name: 'Originality & Innovation', maxMarks: 10 },
    { id: 3, code: 'presentation', name: 'Presentation Skills', maxMarks: 10 },
    { id: 4, code: 'slides', name: 'Slide Quality', maxMarks: 10 },
    { id: 5, code: 'qa', name: 'Q&A / Understanding of Work', maxMarks: 10 },
  );

  // ---- People ----
  const person = (id: string, email: string, name: string, role: AppRole | null, phone: string): DProfile => {
    const p: DProfile = { id, email, fullName: name, role, phone };
    s.profiles.set(id, p);
    return p;
  };
  person('u-chair', 'chair@demo.edu', 'Dr. Asha Rao', 'organizing_chair', '98450 10001');
  person('u-inc', 'incharge@demo.edu', 'Prof. Kiran Shetty', 'session_incharge', '98450 10002');
  person('u-meera', 'meera@demo.edu', 'Dr. Meera Nair', 'panel_member', '98450 20001');
  person('u-rahul', 'rahul@demo.edu', 'Dr. Rahul Bhat', 'panel_member', '98450 20002');
  person('u-sneha', 'sneha@demo.edu', 'Dr. Sneha Kulkarni', 'panel_member', '98450 20003');

  s.invites.set('chair@demo.edu', 'organizing_chair');
  s.invites.set('incharge@demo.edu', 'session_incharge');
  s.invites.set('incharge2@demo.edu', 'session_incharge'); // invited, not signed up yet

  // ---- Papers ----
  const a = (name: string, aff: string, email: string, phone: string): Author => ({ name, affiliation: aff, email, phone });
  const sahyadri = 'Sahyadri College of Engineering & Management';
  const paper = (pid: string, title: string, track: number, review: number | null, authors: Author[]): void => {
    s.papers.set(`pp-${pid}`, { id: `pp-${pid}`, pid, title, trackId: track, reviewScore: review, panelId: null, authors });
  };

  paper('C101', 'Federated Learning for Privacy-Preserving Healthcare Analytics', 1, 41, [
    a('Ananya Pai', sahyadri, 'ananya.pai@example.com', '90000 00101'),
    a("Rohan D'Souza", 'NITK Surathkal', 'rohan.dsouza@example.com', '90000 00102'),
  ]);
  paper('C102', 'Serverless Cost Optimization Using Reinforcement Learning', 1, 36.5, [
    a('Karthik Hegde', sahyadri, 'karthik.h@example.com', '90000 00103'),
  ]);
  paper('C103', 'A Lightweight Blockchain Framework for Academic Credential Verification', 1, 44, [
    a('Fathima Rizwana', 'St Joseph Engineering College', 'fathima.r@example.com', '90000 00104'),
    a('Nikhil Kamath', 'Infosys Ltd', 'nikhil.k@example.com', '90000 00105'),
  ]);
  paper('C104', 'Graph Neural Networks for Source-Code Vulnerability Detection', 1, null, [
    a('Pooja Shenoy', 'Manipal Institute of Technology', 'pooja.s@example.com', '90000 00106'),
  ]);
  paper('C105', 'Energy-Aware Task Scheduling in Edge Clusters', 1, 33, [
    a('Arjun Bhandary', sahyadri, 'arjun.b@example.com', '90000 00107'),
  ]);
  paper('S201', 'Low-Power 6T SRAM Design in 7nm FinFET Technology', 2, 39, [
    a('Divya Acharya', 'NITK Surathkal', 'divya.a@example.com', '90000 00201'),
    a('Suresh Gowda', 'Intel India', 'suresh.g@example.com', '90000 00202'),
  ]);
  paper('S202', 'Machine-Learning Based Yield Prediction for Wafer Fabrication', 2, 42.5, [
    a('Akash Rai', sahyadri, 'akash.rai@example.com', '90000 00203'),
  ]);
  paper('S203', 'A 12-bit SAR ADC for Wearable Biomedical Sensors', 2, 35, [
    a('Lavanya Bhat', 'RV College of Engineering', 'lavanya.b@example.com', '90000 00204'),
  ]);
  paper('M301', 'Vision-Guided Robotic Arm for Areca Nut Sorting', 3, 40, [
    a('Prajwal Shetty', sahyadri, 'prajwal.s@example.com', '90000 00301'),
    a('Vinay Poojary', sahyadri, 'vinay.p@example.com', '90000 00302'),
  ]);
  paper('M302', 'Adaptive PID Control of a Quadcopter Using Fuzzy Logic', 3, 37, [
    a('Shreya Kini', 'NMAM Institute of Technology', 'shreya.k@example.com', '90000 00303'),
  ]);
  paper('M303', 'Low-Cost Exoskeleton for Lower-Limb Rehabilitation', 3, 45, [
    a('Mohammed Irfan', 'Bosch India', 'irfan.m@example.com', '90000 00304'),
  ]);
  paper('I401', 'Edge AI for Early Detection of Crop Diseases', 4, 43, [
    a('Rakshitha Gowda', sahyadri, 'rakshitha.g@example.com', '90000 00401'),
    a('Tejas Naik', 'Wipro Ltd', 'tejas.n@example.com', '90000 00402'),
  ]);
  paper('I402', 'Explainable Credit Scoring with Gradient Boosting', 4, 38, [
    a('Sahana Rao', 'Canara Engineering College', 'sahana.r@example.com', '90000 00403'),
  ]);
  paper('I403', 'Multilingual Speech Recognition for Kannada and Tulu', 4, 46, [
    a('Deepak Alva', sahyadri, 'deepak.a@example.com', '90000 00404'),
  ]);
  paper('I404', 'Driver Drowsiness Detection Using Vision Transformers', 4, 34.5, [
    a('Ankitha Shetty', 'NITK Surathkal', 'ankitha.s@example.com', '90000 00405'),
  ]);
  paper('K501', 'Beamforming Optimization for 6G Massive MIMO', 5, 41.5, [
    a('Gautham Pai', 'IISc Bengaluru', 'gautham.p@example.com', '90000 00501'),
  ]);
  paper('K502', 'LoRaWAN-Based Smart Irrigation Network', 5, 36, [
    a('Keerthana M', sahyadri, 'keerthana.m@example.com', '90000 00502'),
  ]);
  paper('K503', 'Physical-Layer Security with Reconfigurable Intelligent Surfaces', 5, null, [
    a('Varun Kumar', 'Qualcomm India', 'varun.k@example.com', '90000 00503'),
  ]);

  // ---- Panels ----
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
  const at = (h: number): string => localIso(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), h));

  const panel = (id: string, name: string, trackId: number, venue: string, scheduledAt: string): DPanel => {
    const p: DPanel = { id, name, trackId, venue, scheduledAt };
    s.panels.set(id, p);
    return p;
  };
  panel('pn-comp-a', 'Computing – Panel A', 1, 'Seminar Hall 1', at(10));
  panel('pn-semi-a', 'Semiconductor – Panel A', 2, 'Seminar Hall 2', at(11));
  panel('pn-is-a', 'Intelligent Systems – Panel A', 4, 'Lab Block 204', at(14));

  const member = (
    id: string,
    panelId: string,
    pos: number,
    name: string,
    email: string,
    phone: string,
    aff: string,
    profile: string | null,
  ): void => {
    s.members.set(id, { id, panelId, position: pos, name, email, phone, affiliation: aff, profileId: profile });
  };
  member('m-comp-1', 'pn-comp-a', 1, 'Dr. Meera Nair', 'meera@demo.edu', '98450 20001', sahyadri, 'u-meera');
  member('m-comp-2', 'pn-comp-a', 2, 'Dr. Rahul Bhat', 'rahul@demo.edu', '98450 20002', 'NITK Surathkal', 'u-rahul');
  member('m-semi-1', 'pn-semi-a', 1, 'Dr. Meera Nair', 'meera@demo.edu', '98450 20001', sahyadri, 'u-meera');
  member('m-semi-2', 'pn-semi-a', 2, 'Dr. Prakash Joshi', 'prakash@demo.edu', '98450 20004', 'Intel India', null);
  member('m-is-1', 'pn-is-a', 1, 'Dr. Sneha Kulkarni', 'sneha@demo.edu', '98450 20003', 'Manipal Institute of Technology', 'u-sneha');
  member('m-is-2', 'pn-is-a', 2, 'Dr. Vikram Hegde', 'vikram@demo.edu', '98450 20005', 'TCS Research', null);

  for (const pid of ['C101', 'C102', 'C103', 'C104']) {
    s.papers.get(`pp-${pid}`)!.panelId = 'pn-comp-a';
  }
  for (const pid of ['S201', 'S202']) {
    s.papers.get(`pp-${pid}`)!.panelId = 'pn-semi-a';
  }
  for (const pid of ['I401', 'I402', 'I403']) {
    s.papers.get(`pp-${pid}`)!.panelId = 'pn-is-a';
  }

  // ---- Evaluations (criterion id -> marks) ----
  const m = (v: number[]): Record<number, number> => {
    const o: Record<number, number> = {};
    v.forEach((x, i) => {
      o[i + 1] = x;
    });
    return o;
  };
  const eval_ = (pid: string, memberId: string, marks: Record<number, number>, submitted = true, comments: string | null = null): void => {
    const id = `ev-${pid}-${memberId}`;
    s.evals.set(id, { id, paperId: `pp-${pid}`, memberId, marks, submitted, comments });
  };

  eval_('C101', 'm-comp-1', m([9, 8, 8, 9, 8]), true, 'Strong evaluation on real hospital data.'); // 42
  eval_('C101', 'm-comp-2', m([8, 8, 7, 8, 7])); // 38 -> presentation 40
  eval_('C102', 'm-comp-1', m([7, 7, 8, 7, 7])); // 36
  eval_('C102', 'm-comp-2', { 1: 6, 2: 7 }, false); // draft
  eval_('C103', 'm-comp-2', m([9, 9, 9, 8, 9])); // 44
  eval_('I401', 'm-is-1', m([8, 9, 8, 8, 9])); // 42
  eval_('I402', 'm-is-1', { 1: 7, 2: 6, 3: 8 }, false); // draft

  return s;
}

let demoStore: DemoStore | null = null;

/** The shared demo store (one instance for the whole app). */
export function getDemoStore(): DemoStore {
  if (!demoStore) demoStore = seedDemoStore();
  return demoStore;
}
