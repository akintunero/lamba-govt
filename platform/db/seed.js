const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const MINISTRIES = [
  { id: 1, name: 'Ministry of Internal Affairs', acronym: 'MIA' },
  { id: 2, name: 'Ministry of Defence', acronym: 'MOD' },
  { id: 3, name: 'Ministry of Education', acronym: 'MEDU' },
  { id: 4, name: 'Ministry of Health', acronym: 'MOH' },
  { id: 5, name: 'Ministry of Finance', acronym: 'MOF' },
  { id: 6, name: 'Ministry of Justice', acronym: 'MOJ' },
  { id: 7, name: 'Ministry of Works & Housing', acronym: 'MWH' },
  { id: 8, name: 'Ministry of Agriculture', acronym: 'MOA' }
];

const FIRST_NAMES = [
  'Amina', 'Chidi', 'Fatima', 'Emeka', 'Ngozi', 'Tunde', 'Kemi', 'Obinna', 'Zainab', 'Dayo',
  'Chioma', 'Musa', 'Yemi', 'Adanna', 'Segun', 'Efe', 'Halima', 'Kayode', 'Mariam', 'Tobi',
  'Uche', 'Bolanle', 'Chuka', 'Folake', 'Ikenna', 'Jumoke', 'Kehinde', 'Lola', 'Nnenna', 'Olisa',
  'Rashidat', 'Suleiman', 'Titilayo', 'Uzoma', 'Yetunde', 'Abimbola', 'Babatunde', 'Chinwe', 'Damilola', 'Ezinne',
  'Femi', 'Gambo', 'Habiba', 'Ifeanyi', 'Josephine', 'Kingsley', 'Latifat', 'Mobolaji', 'Ngozi', 'Oluwaseun'
];

const LAST_NAMES = [
  'Okoro', 'Adeyemi', 'Bello', 'Chukwu', 'Diya', 'Ekwueme', 'Fashola', 'Gowon', 'Hassan', 'Ibrahim',
  'Johnson', 'Kalu', 'Lawal', 'Mensah', 'Nwosu', 'Okafor', 'Peters', 'Quadri', 'Rauf', 'Salisu',
  'Tanko', 'Umar', 'Vanderpuye', 'Williams', 'Yakubu', 'Zubairu', 'Abubakar', 'Balogun', 'Coker', 'Danjuma',
  'Eze', 'Fanan', 'Garba', 'Haruna', 'Ismaila', 'Jibrin', 'Kazeem', 'Ladipo', 'Madaki', 'Nnamani',
  'Ogunlesi', 'Popoola', 'Rasaki', 'Sanusi', 'Tella', 'Ugbaja', 'Wahab', 'Yusuf', 'Zakari', 'Aliyu'
];

const ROLES = [
  'Director', 'Deputy Director', 'Senior Officer', 'Policy Officer',
  'Analyst', 'Administrative Officer', 'Compliance Officer', 'Auditor',
  'ICT Officer', 'Records Officer', 'Human Resources', 'Finance Officer',
  'Legal Counsel', 'Procurement Officer', 'Internal Auditor', 'Data Entry Clerk'
];

const DOCUMENT_TYPES = ['policy', 'memo', 'grant', 'report', 'directive', 'minutes', 'contract'];
const CLASSIFICATIONS = ['public', 'internal', 'confidential'];

const POLICY_TITLES = [
  'National Identity Management Policy', 'Digital Transformation Strategy 2025',
  'Cybersecurity Incident Response Plan', 'Data Protection and Privacy Framework',
  'Public Procurement Guidelines', 'Civil Service Reform Agenda',
  'National Health Insurance Scheme Update', 'Education Sector Strategic Plan',
  'Border Security Enhancement Memo', 'Tax Revenue Modernisation Programme',
  'Social Welfare Eligibility Criteria', 'Infrastructure Development Priority List',
  'Agricultural Subsidy Framework', 'Justice Sector Reform Blueprint',
  'Anti-Corruption Strategy Document', 'Emergency Response Standard Operating Procedures',
  'National Budget Circular 2025', 'Public Service Code of Conduct',
  'ICT Asset Management Policy', 'Records Retention and Disposal Schedule',
  'Internal Audit Charter', 'Whistleblower Protection Guidelines',
  'Gender Equality Policy Framework', 'Youth Empowerment Programme Outline',
  'National ID Card Issuance Protocol', 'Government Portal Access Control Policy',
  'Email and Communication Usage Policy', 'Financial Reporting Standards',
  'Disaster Management Contingency Plan', 'Public Private Partnership Framework'
];

const GRANT_TYPES = [
  'Education Infrastructure Grant', 'Healthcare Facility Upgrade',
  'Rural Road Development Fund', 'Water Sanitation Project',
  'Renewable Energy Initiative', 'Small Business Support Scheme',
  'Agricultural Modernisation Grant', 'Digital Literacy Programme',
  'Community Development Project', 'Youth Sports Development Fund',
  'Emergency Relief Allocation', 'Research and Innovation Grant',
  'Cultural Preservation Fund', 'Housing Development Scheme',
  'Environmental Protection Grant'
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function generatePhone() {
  const prefixes = ['070', '080', '081', '090', '091'];
  return `${randomPick(prefixes)}${Array(8).fill(0).map(() => randomInt(0, 9)).join('')}`;
}

function generatePassport(id) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return `LB${letters[id % 26]}${String(id).padStart(6, '0')}`;
}

function generateNIN(id) {
  const digits = String(id).padStart(11, '0');
  return `LA${digits}${randomInt(10, 99)}`;
}

function maskPII(value) {
  if (!value || value.length < 4) return value;
  const prefix = value.slice(0, 2);
  const suffix = value.slice(-4);
  const masked = '*'.repeat(Math.max(0, value.length - 6));
  return `${prefix}${masked}${suffix}`;
}

async function main() {
  // Clean existing data
  await prisma.report.deleteMany();
  await prisma.storedFile.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.session.deleteMany();
  await prisma.documentRequest.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.grantApproval.deleteMany();
  await prisma.user.deleteMany();
  await prisma.document.deleteMany();
  await prisma.citizen.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.ministry.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.serviceIdentity.deleteMany();
  await prisma.role.deleteMany();

  // Permissions
  await prisma.permission.createMany({
    data: [
      { name: 'documents.read', description: 'Read document metadata' },
      { name: 'documents.write', description: 'Upload and modify documents' },
      { name: 'citizens.read', description: 'Read citizen records' },
      { name: 'citizens.write', description: 'Create and update citizen records' },
      { name: 'employees.read', description: 'View employee directory' },
      { name: 'reports.generate', description: 'Generate platform reports' },
      { name: 'grants.approve', description: 'Approve grant applications' },
      { name: 'audit.view', description: 'View audit logs' },
      { name: 'admin.manage', description: 'Administrative operations' },
      { name: 'notifications.send', description: 'Send system notifications' }
    ]
  });

  const perms = await prisma.permission.findMany();

  // Roles
  await prisma.role.createMany({
    data: [
      { id: 1, name: 'citizen', permissions: 'read:own,request:documents' },
      { id: 2, name: 'clerk', permissions: 'read:citizens,update:requests,read:documents' },
      { id: 3, name: 'compliance_officer', permissions: 'read:all,audit:view' },
      { id: 4, name: 'admin', permissions: 'read:all,approve:grants,manage:ministries,send:notifications' }
    ]
  });

  const rolePermData = [];
  const adminRoleId = 4;
  for (const p of perms) {
    rolePermData.push({ roleId: adminRoleId, permissionId: p.id });
    if (p.name.startsWith('documents') || p.name.startsWith('citizens') || p.name === 'employees.read') {
      rolePermData.push({ roleId: 2, permissionId: p.id });
    }
    if (p.name.startsWith('audit')) {
      rolePermData.push({ roleId: 3, permissionId: p.id });
    }
  }
  await prisma.rolePermission.createMany({ data: rolePermData });

  // Service identities
  await prisma.serviceIdentity.createMany({
    data: [
      { serviceName: 'auth-service', token: process.env.SERVICE_AUTH_TOKEN },
      { serviceName: 'citizen-service', token: process.env.SERVICE_AUTH_TOKEN },
      { serviceName: 'document-service', token: process.env.SERVICE_AUTH_TOKEN },
      { serviceName: 'admin-service', token: process.env.SERVICE_AUTH_TOKEN },
      { serviceName: 'audit-service', token: process.env.SERVICE_AUTH_TOKEN },
      { serviceName: 'notification-service', token: process.env.SERVICE_AUTH_TOKEN },
      { serviceName: 'reporting-service', token: process.env.SERVICE_AUTH_TOKEN },
      { serviceName: 'file-storage-service', token: process.env.SERVICE_AUTH_TOKEN }
    ]
  });

  // Ministries
  await prisma.ministry.createMany({ data: MINISTRIES });

  // 100+ Employees
  const employees = [];
  const MINISTRY_HEADS = {
    1: { name: 'Dr. Amina Okoro', role: 'Director' },
    2: { name: 'Col. Chidi Bello', role: 'Director' },
    3: { name: 'Prof. Fatima Hassan', role: 'Director' },
    4: { name: 'Dr. Emeka Nwosu', role: 'Director' },
    5: { name: 'Mr. Tunde Balogun', role: 'Director' },
    6: { name: 'Barr. Ngozi Eze', role: 'Director' },
    7: { name: 'Engr. Obinna Okafor', role: 'Director' },
    8: { name: 'Dr. Zainab Abubakar', role: 'Director' }
  };

  let empId = 1001;
  for (const [ministryId, head] of Object.entries(MINISTRY_HEADS)) {
    const [first, ...rest] = head.name.replace(/^(Dr\.|Col\.|Prof\.|Mr\.|Barr\.|Engr\.)\s*/, '').split(' ');
    const last = rest.join(' ');
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@gov.lamba`.replace(/\s/g, '');
    employees.push({
      id: empId++,
      name: head.name,
      email,
      phone: generatePhone(),
      passport: generatePassport(empId),
      nin: generateNIN(empId),
      role: 'Director',
      internalNotes: null,
      ministryId: parseInt(ministryId)
    });
  }

  // Middle management
  const DEPUTY_DIRECTORS = [
    { name: 'Rachel Patel', ministryId: 1 }, { name: 'James Wilson', ministryId: 1 },
    { name: 'Samuel Adekunle', ministryId: 2 }, { name: 'Grace Okonkwo', ministryId: 2 },
    { name: 'Peter Ogunlade', ministryId: 3 }, { name: 'Alice Okafor', ministryId: 3 },
    { name: 'Michael Taylor', ministryId: 4 }, { name: 'Sarah Ibrahim', ministryId: 4 },
    { name: 'Daniel Mensah', ministryId: 5 }, { name: 'Esther Chukwu', ministryId: 5 },
    { name: 'George Ebere', ministryId: 6 }, { name: 'Hannah Yussuf', ministryId: 6 },
    { name: 'Isaac Danjuma', ministryId: 7 }, { name: 'Janet Oyelowo', ministryId: 7 },
    { name: 'Kenneth Osei', ministryId: 8 }, { name: 'Linda Mba', ministryId: 8 }
  ];

  for (const dd of DEPUTY_DIRECTORS) {
    const nameParts = dd.name.split(' ');
    const email = `${nameParts[0].toLowerCase()}.${nameParts[1].toLowerCase()}@gov.lamba`;
    employees.push({
      id: empId++,
      name: dd.name,
      email,
      phone: generatePhone(),
      passport: generatePassport(empId),
      nin: generateNIN(empId),
      role: 'Deputy Director',
      internalNotes: null,
      ministryId: dd.ministryId
    });
  }

  // Remaining staff
  const usedPairs = new Set();
  for (let i = 0; i < 80; i++) {
    let first, last, name;
    do {
      first = randomPick(FIRST_NAMES);
      last = randomPick(LAST_NAMES);
      name = `${first} ${last}`;
    } while (usedPairs.has(name));
    usedPairs.add(name);

    const role = randomPick(ROLES);
    const ministryId = randomInt(1, 8);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@gov.lamba`;

    const sqlMarker = name === 'Michael Taylor'
      ? 'INJECTION_PROOF_ALPHA73'
      : null;

    employees.push({
      id: empId++,
      name,
      email,
      phone: generatePhone(),
      passport: generatePassport(empId),
      nin: generateNIN(empId),
      role,
      internalNotes: sqlMarker,
      ministryId
    });
  }

  await prisma.employee.createMany({ data: employees });

  // Citizens
  const citizenData = [
    { nationalId: 'LAMBA-2024-00001', firstName: 'Amina', lastName: 'Okoro', email: 'amina.okoro@citizen.lamba', phone: '+234 801 000 0001', status: 'verified' },
    { nationalId: 'LAMBA-2024-00002', firstName: 'Chidi', lastName: 'Okafor', email: 'chidi.okafor@citizen.lamba', phone: '+234 802 000 0002', status: 'verified' },
    { nationalId: 'LAMBA-2024-00003', firstName: 'Fatima', lastName: 'Bello', email: 'fatima.bello@citizen.lamba', phone: '+234 803 000 0003', status: 'verified' },
    { nationalId: 'LAMBA-2024-00004', firstName: 'Emeka', lastName: 'Nwosu', email: 'emeka.nwosu@citizen.lamba', phone: '+234 804 000 0004', status: 'pending' },
    { nationalId: 'LAMBA-2024-00005', firstName: 'Ngozi', lastName: 'Ekwueme', email: 'ngozi.ekwueme@citizen.lamba', phone: '+234 805 000 0005', status: 'verified' },
    { nationalId: 'LAMBA-2024-00006', firstName: 'Tunde', lastName: 'Adeyemi', email: 'tunde.adeyemi@citizen.lamba', phone: '+234 806 000 0006', status: 'pending' },
    { nationalId: 'LAMBA-2024-00007', firstName: 'Kemi', lastName: 'Fashola', email: 'kemi.fashola@citizen.lamba', phone: '+234 807 000 0007', status: 'verified' },
    { nationalId: 'LAMBA-2024-00008', firstName: 'Obinna', lastName: 'Chukwu', email: 'obinna.chukwu@citizen.lamba', phone: '+234 808 000 0008', status: 'verified' },
    { nationalId: 'LAMBA-2024-00009', firstName: 'Zainab', lastName: 'Hassan', email: 'zainab.hassan@citizen.lamba', phone: '+234 809 000 0009', status: 'pending' },
    { nationalId: 'LAMBA-2024-00010', firstName: 'Dayo', lastName: 'Ibrahim', email: 'dayo.ibrahim@citizen.lamba', phone: '+234 810 000 0010', status: 'verified' },
    { nationalId: 'LAMBA-2024-00011', firstName: 'Chioma', lastName: 'Johnson', email: 'chioma.johnson@citizen.lamba', phone: '+234 811 000 0011', status: 'verified' },
    { nationalId: 'LAMBA-2024-00012', firstName: 'Musa', lastName: 'Kalu', email: 'musa.kalu@citizen.lamba', phone: '+234 812 000 0012', status: 'pending' },
    { nationalId: 'LAMBA-2024-00013', firstName: 'Yemi', lastName: 'Lawal', email: 'yemi.lawal@citizen.lamba', phone: '+234 813 000 0013', status: 'verified' },
    { nationalId: 'LAMBA-2024-00014', firstName: 'Adanna', lastName: 'Mensah', email: 'adanna.mensah@citizen.lamba', phone: '+234 814 000 0014', status: 'verified' },
    { nationalId: 'LAMBA-2024-00015', firstName: 'Segun', lastName: 'Peters', email: 'segun.peters@citizen.lamba', phone: '+234 815 000 0015', status: 'pending' },
    { nationalId: 'LAMBA-2024-00016', firstName: 'Efe', lastName: 'Quadri', email: 'efe.quadri@citizen.lamba', phone: '+234 816 000 0016', status: 'verified' },
    { nationalId: 'LAMBA-2024-00017', firstName: 'Halima', lastName: 'Rauf', email: 'halima.rauf@citizen.lamba', phone: '+234 817 000 0017', status: 'verified' },
    { nationalId: 'LAMBA-2024-00018', firstName: 'Kayode', lastName: 'Salisu', email: 'kayode.salisu@citizen.lamba', phone: '+234 818 000 0018', status: 'verified' },
    { nationalId: 'LAMBA-2024-00019', firstName: 'Mariam', lastName: 'Tanko', email: 'mariam.tanko@citizen.lamba', phone: '+234 819 000 0019', status: 'pending' },
    { nationalId: 'LAMBA-2024-00020', firstName: 'Tobi', lastName: 'Umar', email: 'tobi.umar@citizen.lamba', phone: '+234 820 000 0020', status: 'verified' }
  ];

  for (const c of citizenData) {
    const created = await prisma.citizen.create({
      data: {
        nationalId: c.nationalId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        status: c.status,
        verifiedAt: c.status === 'verified' ? new Date() : null
      }
    });

    if (c.status === 'verified') {
      await prisma.storedFile.create({
        data: {
          bucket: 'lamba-citizen-uploads',
          objectKey: `citizen/${created.id}/id-document.pdf`,
          filename: 'id-document.pdf',
          mimeType: 'application/pdf',
          size: randomInt(100000, 500000),
          citizenId: created.id,
          metadata: JSON.stringify({ source: 'onboarding', verifiedAt: new Date().toISOString() })
        }
      });
    }
  }

  // 50+ Documents across ministries
  const documents = [];
  for (let i = 0; i < 60; i++) {
    const title = randomPick(POLICY_TITLES) + (i >= 30 ? ` (Amendment ${i - 29})` : '');
    const docType = randomPick(DOCUMENT_TYPES);
    const classification = i < 3 ? 'confidential' : randomPick(CLASSIFICATIONS);
    const ministryId = randomInt(1, 8);

    documents.push({
      id: i + 1,
      title,
      type: docType,
      classification,
      content: `${title}\n\nThis document outlines the framework for ${title.toLowerCase()} within the Lamba government digital services ecosystem. Authorised personnel should review and implement as directed.\n\nEffective Date: 2025-Q${randomInt(1, 4)}\nStatus: ${randomPick(['Active', 'Under Review', 'Pending Approval', 'Archived'])}`,
      ministryId,
      status: 'active',
      bucket: 'lamba-documents',
      storageKey: `${docType}s/${title.toLowerCase().replace(/\s+/g, '-')}-v1.pdf`
    });
  }

  // Document 3 is the confidential cybersecurity strategy (IDOR challenge)
  documents[2] = {
    id: 3,
    title: 'Internal Cybersecurity Strategy',
    type: 'policy',
    classification: 'confidential',
    content: 'INTERNAL — EYES ONLY\n\nThis document contains sensitive cybersecurity controls, incident response runbooks, and network architecture details for the Lamba Government Digital Services Platform. Unauthorised access is prohibited.\n\nKey controls:\n- Network segmentation across 8 ministry zones\n- SIEM integration with audit event correlation\n- Quarterly penetration testing mandate\n- Classified incident response protocols',
    ministryId: 1,
    status: 'active',
    bucket: 'lamba-documents',
    storageKey: 'policies/cybersecurity-strategy-v1.pdf'
  };

  await prisma.document.createMany({ data: documents });

  for (const doc of documents) {
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storageKey: doc.storageKey,
        bucket: doc.bucket,
        checksum: `sha256-${doc.id}-v1`,
        createdBy: 'system'
      }
    });
  }

  // Document requests
  const citizens = await prisma.citizen.findMany();
  for (const c of citizens) {
    await prisma.documentRequest.create({
      data: {
        citizenId: c.id,
        documentType: randomPick(['national_id_card', 'passport', 'birth_certificate', 'marriage_certificate', 'tax_clearance', 'police_clearance']),
        status: randomPick(['submitted', 'processing', 'approved', 'rejected']),
        submittedAt: new Date(Date.now() - randomInt(0, 30) * 86400000)
      }
    });
  }

  // Grant approvals
  for (const grant of GRANT_TYPES) {
    await prisma.grantApproval.create({
      data: {
        applicant: `${grant} - ${randomPick(['Lamba State Govt', 'Federal Allocation', 'NGO Partner', 'Private Sector'])}`,
        amount: randomInt(100000, 5000000),
        status: randomPick(['pending', 'approved', 'rejected']),
        approvedBy: randomPick(['admin@gov.lamba', 'compliance@gov.lamba']),
        createdAt: new Date(Date.now() - randomInt(0, 60) * 86400000)
      }
    });
  }

  // Seed users
  const studentEmail = process.env.SEED_STUDENT_EMAIL || 'student@gov.lamba';
  const studentPassword = process.env.SEED_STUDENT_PASSWORD || 'DefaultPass123!';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@gov.lamba';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'DefaultAdminPass123!';

  const studentEmp = await prisma.employee.findFirst({ where: { role: 'Analyst' } });
  const adminEmp = await prisma.employee.findFirst({ where: { role: 'Deputy Director' } });

  const studentUser = await prisma.user.create({
    data: {
      email: studentEmail,
      password: await bcrypt.hash(studentPassword, 10),
      role: 'clerk',
      roleId: 2,
      employeeId: studentEmp?.id || 1001,
      citizenId: citizens[0]?.id || null
    }
  });

  await prisma.user.create({
    data: {
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      role: 'admin',
      roleId: 4,
      employeeId: adminEmp?.id || 1002,
      citizenId: citizens[1]?.id || null
    }
  });

  // Notifications for seed user
  const notificationMessages = [
    { channel: 'in_app', message: 'Your ID verification request has been approved.' },
    { channel: 'in_app', message: 'New document available: National Identity Management Policy.' },
    { channel: 'in_app', message: 'Grant application status updated to pending review.' },
    { channel: 'in_app', message: 'Password change required — your password has expired.' },
    { channel: 'in_app', message: 'New compliance report generated for Q1 2025.' },
    { channel: 'email', message: 'Login detected from new device. If this was not you, reset your password.' }
  ];

  for (const notif of notificationMessages) {
    await prisma.notification.create({
      data: {
        userId: studentUser.id,
        channel: notif.channel,
        message: notif.message,
        read: false
      }
    });
  }

  // Audit logs
  const auditActions = [
    { action: 'USER_LOGIN', detail: 'Student user login from IP 10.0.1.50', service: 'auth-service' },
    { action: 'USER_LOGIN', detail: 'Admin user login from IP 10.0.1.51', service: 'auth-service' },
    { action: 'DOCUMENT_VIEW', detail: 'Document #3 accessed without authentication', service: 'document-service' },
    { action: 'DOCUMENT_VIEW', detail: 'Document #1 accessed by student@gov.lamba', service: 'document-service' },
    { action: 'SEARCH_EXECUTED', detail: 'Employee search query: "Taylor"', service: 'citizen-service' },
    { action: 'GRANT_REVIEW', detail: 'Education Infrastructure Grant approved by admin@gov.lamba', service: 'admin-service' },
    { action: 'GRANT_REVIEW', detail: 'Healthcare Facility Upgrade rejected — insufficient documentation', service: 'admin-service' },
    { action: 'CITIZEN_CREATED', detail: 'New citizen onboarded: Chidi Okafor (LAMBA-2024-00002)', service: 'citizen-service' },
    { action: 'IDENTITY_VERIFIED', detail: 'Citizen Amina Okoro identity verified', service: 'citizen-service' },
    { action: 'SYSTEM_START', detail: 'Platform initialised — services: 11, mode: lite', service: 'platform' },
    { action: 'SYSTEM_AUDIT', detail: 'Weekly compliance audit run by audit-service', service: 'audit-service' },
    { action: 'PASSWORD_RESET', detail: 'Password reset requested for admin@gov.lamba', service: 'auth-service' },
    { action: 'SESSION_CREATED', detail: 'New session created for student@gov.lamba', service: 'auth-service' },
    { action: 'NOTIFICATION_SENT', detail: 'In-app notification sent to student@gov.lamba', service: 'notification-service' },
    { action: 'LEGACY_SYNC', detail: 'Legacy citizen records synchronised — 20 records migrated', service: 'legacy-records-service' }
  ];

  for (const audit of auditActions) {
    await prisma.auditLog.create({
      data: {
        action: audit.action,
        detail: audit.detail,
        service: audit.service,
        actor: audit.detail.includes('admin@') ? 'admin@gov.lamba' : 'system',
        createdAt: new Date(Date.now() - randomInt(0, 7) * 86400000)
      }
    });
  }

  // Reports
  const reports = [
    { type: 'compliance', title: 'Monthly Compliance Summary — March 2025', payload: JSON.stringify({ period: '2025-Q1', status: 'completed', findings: 12, resolved: 10 }), generatedBy: 'system' },
    { type: 'operational', title: 'Service Uptime Report — Q1 2025', payload: JSON.stringify({ period: '2025-Q1', uptime: 99.97, incidents: 3 }), generatedBy: 'system' },
    { type: 'financial', title: 'Grant Disbursement Summary', payload: JSON.stringify({ period: '2025-Q1', totalApproved: 8, totalAmount: 12500000 }), generatedBy: 'system' },
    { type: 'audit', title: 'Security Audit Findings — March 2025', payload: JSON.stringify({ period: '2025-03', critical: 2, high: 5, medium: 8, low: 12 }), generatedBy: 'system' },
    { type: 'identity', title: 'Citizen Verification Report', payload: JSON.stringify({ period: '2025-Q1', totalVerified: 14, pending: 6, rejectionRate: 0.03 }), generatedBy: 'system' }
  ];

  for (const report of reports) {
    await prisma.report.create({
      data: {
        type: report.type,
        title: report.title,
        payload: report.payload,
        generatedBy: report.generatedBy,
        status: 'completed'
      }
    });
  }

  // Sessions for seed user
  await prisma.session.create({
    data: {
      sessionId: `sess_${Date.now()}`,
      userId: studentUser.id,
      expiresAt: new Date(Date.now() + 8 * 3600000)
    }
  });

  console.log(`Seed complete: ${employees.length} employees, ${documents.length} documents, ${citizens.length} citizens`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
