const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
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

  await prisma.permission.createMany({
    data: [
      { name: 'documents.read', description: 'Read document metadata' },
      { name: 'documents.write', description: 'Upload and modify documents' },
      { name: 'citizens.read', description: 'Read citizen records' },
      { name: 'reports.generate', description: 'Generate platform reports' },
      { name: 'admin.manage', description: 'Administrative operations' }
    ]
  });

  await prisma.role.createMany({
    data: [
      { id: 1, name: 'citizen', permissions: 'read:own,request:documents' },
      { id: 2, name: 'clerk', permissions: 'read:citizens,update:requests' },
      { id: 3, name: 'admin', permissions: 'read:all,approve:grants,manage:ministries' }
    ]
  });

  const perms = await prisma.permission.findMany();
  const rolePermData = [];
  for (const p of perms) {
    rolePermData.push({ roleId: 3, permissionId: p.id });
    if (p.name.startsWith('documents') || p.name.startsWith('citizens')) {
      rolePermData.push({ roleId: 2, permissionId: p.id });
    }
  }
  await prisma.rolePermission.createMany({ data: rolePermData });

  await prisma.serviceIdentity.createMany({
    data: [
      { serviceName: 'auth-service', token: process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1' },
      { serviceName: 'citizen-service', token: process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1' },
      { serviceName: 'document-service', token: process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1' },
      { serviceName: 'admin-service', token: process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1' },
      { serviceName: 'audit-service', token: process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1' },
      { serviceName: 'notification-service', token: process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1' },
      { serviceName: 'reporting-service', token: process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1' },
      { serviceName: 'file-storage-service', token: process.env.SERVICE_AUTH_TOKEN || 'lamba-inter-service-token-v1' }
    ]
  });

  await prisma.ministry.createMany({
    data: [
      { id: 1, name: 'Ministry of Internal Affairs', acronym: 'MIA' },
      { id: 2, name: 'Ministry of Defence', acronym: 'MOD' },
      { id: 3, name: 'Ministry of Education', acronym: 'MEDU' },
      { id: 4, name: 'Ministry of Health', acronym: 'MOH' },
      { id: 5, name: 'Ministry of Finance', acronym: 'MOF' }
    ]
  });

  const employeesData = [
    { id: 1001, name: 'Michael Taylor', email: 'm.taylor@gov.lamba', phone: '07**1 234567', passport: 'LB**456789', nin: 'LA**123456789', role: 'Director', internalNotes: 'INJECTION_PROOF_ALPHA73', ministryId: 1 },
    { id: 1002, name: 'Rachel Patel', email: 'r.patel@gov.lamba', phone: '+777 ** 987654', passport: 'LB**987654', nin: 'LA**987654321', role: 'Deputy Director', ministryId: 2 },
    { id: 1003, name: 'James Wilson', email: 'j.wilson@gov.lamba', phone: '07**2 111222', passport: 'LB**112233', nin: 'LA**111222333', role: 'Senior Officer', ministryId: 1 },
    { id: 1004, name: 'Emily Johnson', email: 'e.johnson@gov.lamba', phone: '+777 ** 223344', passport: 'LB**223344', nin: 'LA**222333444', role: 'Policy Officer', ministryId: 3 },
    { id: 1005, name: 'Oliver Brown', email: 'o.brown@gov.lamba', phone: '07**3 333444', passport: 'LB**334455', nin: 'LA**333444555', role: 'Analyst', ministryId: 4 }
  ];
  await prisma.employee.createMany({ data: employeesData });

  const documentsData = [
    { id: 1, title: 'National Identity Policy', type: 'policy', classification: 'public', content: 'Framework for managing national identity records in Lamba.', ministryId: 1, bucket: 'lamba-documents', storageKey: 'policies/national-identity-v1.pdf' },
    { id: 2, title: 'Border Security Memo', type: 'memo', classification: 'internal', content: 'Internal memo on updated border security procedures.', ministryId: 2, bucket: 'lamba-documents', storageKey: 'memos/border-security-v1.pdf' },
    { id: 3, title: 'Internal Cybersecurity Strategy', type: 'policy', classification: 'confidential', content: 'Internal security controls and incident response runbooks.', ministryId: 1, bucket: 'lamba-documents', storageKey: 'policies/cybersecurity-strategy-v1.pdf' },
    { id: 4, title: 'Education Grant Guidelines', type: 'grant', classification: 'public', content: 'Guidelines for applying to national education grants.', ministryId: 3, bucket: 'lamba-documents', storageKey: 'grants/education-guidelines-v1.pdf' },
    { id: 5, title: 'Hospital Funding Allocation', type: 'grant', classification: 'internal', content: 'Projected allocation of hospital funding by district.', ministryId: 4, bucket: 'lamba-documents', storageKey: 'grants/hospital-funding-v1.pdf' }
  ];
  await prisma.document.createMany({ data: documentsData });

  for (const doc of documentsData) {
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

  const citizen = await prisma.citizen.create({
    data: {
      nationalId: 'LAMBA-2024-00001',
      firstName: 'Amina',
      lastName: 'Okoro',
      email: 'amina.okoro@citizen.lamba',
      phone: '+234 801 000 0001',
      status: 'verified',
      verifiedAt: new Date()
    }
  });

  await prisma.documentRequest.create({
    data: { citizenId: citizen.id, documentType: 'national_id_card', status: 'submitted' }
  });

  await prisma.storedFile.create({
    data: {
      bucket: 'lamba-citizen-uploads',
      objectKey: `citizen/${citizen.id}/id-application.pdf`,
      filename: 'id-application.pdf',
      mimeType: 'application/pdf',
      size: 204800,
      citizenId: citizen.id,
      metadata: JSON.stringify({ source: 'onboarding' })
    }
  });

  const studentEmail = process.env.SEED_STUDENT_EMAIL || 'student@gov.lamba';
  const studentPassword = process.env.SEED_STUDENT_PASSWORD || 'welcome123';
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@gov.lamba';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin2024';

  await prisma.user.create({
    data: {
      email: studentEmail,
      password: await bcrypt.hash(studentPassword, 10),
      role: 'clerk',
      roleId: 2,
      employee: { connect: { id: 1001 } }
    }
  });

  await prisma.user.create({
    data: {
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      role: 'admin',
      roleId: 3,
      employee: { connect: { id: 1002 } }
    }
  });

  await prisma.grantApproval.create({
    data: { applicant: 'Lamba Education Trust', amount: 500000, status: 'pending' }
  });

  await prisma.auditLog.createMany({
    data: [
      { action: 'SYSTEM_START', detail: 'Platform initialised', service: 'platform' },
      { action: 'GRANT_REVIEW', detail: 'Initial review of education grant applications completed', service: 'admin-service' }
    ]
  });

  await prisma.report.create({
    data: {
      type: 'compliance',
      title: 'Monthly compliance summary',
      payload: JSON.stringify({ period: '2024-Q1', status: 'draft' }),
      generatedBy: 'system',
      status: 'completed'
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
