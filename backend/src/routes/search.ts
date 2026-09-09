import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { requireAuth } from '../services/auth';

const router = Router();

// GET /api/search?q=XYZ
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const q = (req.query.q as string || '').trim();

  if (!q || q.length < 2) {
    return res.json({ results: { cases: [], persons: [], evidence: [], courtCases: [] } });
  }

  const searchTerm = `%${q}%`;

  // Scoped search enforcing authorization strictly at SQL level
  const [cases, persons, evidence, courtCases] = await Promise.all([
    // 1. Cases
    query(`
      SELECT DISTINCT c.id, c.fir_number, c.title, c.incident_location, c.status, c.year,
             o.name as org_name, 'CASE' as result_type
      FROM cases c
      JOIN organization_nodes o ON c.originating_organization_id = o.id
      LEFT JOIN case_agency_participation cap ON c.id = cap.case_id
      LEFT JOIN delegated_access da ON c.id = da.case_id AND da.granted_to_user_id = $1 AND da.status = 'ACTIVE' AND NOW() BETWEEN da.starts_at AND da.expires_at
      WHERE (
        $2 = 'MASTER_ADMIN'
        OR o.hierarchy_path = $3 OR o.hierarchy_path LIKE $3 || '.%'
        OR cap.organization_id = $4
        OR da.id IS NOT NULL
      ) AND (
        c.fir_number ILIKE $5
        OR c.legacy_fir_number ILIKE $5
        OR c.title ILIKE $5
        OR c.description ILIKE $5
        OR c.incident_location ILIKE $5
      )
      LIMIT 10;
    `, [user.userId, user.roleId, user.organizationPath, user.organizationId, searchTerm]),

    // 2. Persons
    query(`
      SELECT DISTINCT p.id, p.full_name, p.alias, p.id_proof_number, cp.role_in_case,
             c.id as case_id, c.fir_number, 'PERSON' as result_type
      FROM persons p
      JOIN case_persons cp ON p.id = cp.person_id
      JOIN cases c ON cp.case_id = c.id
      JOIN organization_nodes o ON c.originating_organization_id = o.id
      LEFT JOIN case_agency_participation cap ON c.id = cap.case_id
      LEFT JOIN delegated_access da ON c.id = da.case_id AND da.granted_to_user_id = $1 AND da.status = 'ACTIVE' AND NOW() BETWEEN da.starts_at AND da.expires_at
      WHERE (
        $2 = 'MASTER_ADMIN'
        OR o.hierarchy_path = $3 OR o.hierarchy_path LIKE $3 || '.%'
        OR cap.organization_id = $4
        OR da.id IS NOT NULL
      ) AND (
        p.full_name ILIKE $5
        OR p.alias ILIKE $5
        OR p.id_proof_number ILIKE $5
        OR p.phone ILIKE $5
      )
      LIMIT 10;
    `, [user.userId, user.roleId, user.organizationPath, user.organizationId, searchTerm]),

    // 3. Evidence
    query(`
      SELECT DISTINCT e.id, e.evidence_tag, e.category, e.description, e.status,
             c.id as case_id, c.fir_number, 'EVIDENCE' as result_type
      FROM evidence e
      JOIN cases c ON e.case_id = c.id
      JOIN organization_nodes o ON c.originating_organization_id = o.id
      LEFT JOIN case_agency_participation cap ON c.id = cap.case_id
      LEFT JOIN delegated_access da ON c.id = da.case_id AND da.granted_to_user_id = $1 AND da.status = 'ACTIVE' AND NOW() BETWEEN da.starts_at AND da.expires_at
      WHERE (
        $2 = 'MASTER_ADMIN'
        OR o.hierarchy_path = $3 OR o.hierarchy_path LIKE $3 || '.%'
        OR cap.organization_id = $4
        OR da.id IS NOT NULL
      ) AND (
        e.evidence_tag ILIKE $5
        OR e.description ILIKE $5
        OR e.storage_location ILIKE $5
      )
      LIMIT 10;
    `, [user.userId, user.roleId, user.organizationPath, user.organizationId, searchTerm]),

    // 4. Court Cases
    query(`
      SELECT DISTINCT cc.id, cc.cnr_number, cc.court_case_number, cc.court_case_type, cc.current_stage,
             c.id as case_id, c.fir_number, 'COURT' as result_type
      FROM court_cases cc
      JOIN cases c ON cc.case_id = c.id
      JOIN organization_nodes o ON c.originating_organization_id = o.id
      LEFT JOIN case_agency_participation cap ON c.id = cap.case_id
      LEFT JOIN delegated_access da ON c.id = da.case_id AND da.granted_to_user_id = $1 AND da.status = 'ACTIVE' AND NOW() BETWEEN da.starts_at AND da.expires_at
      WHERE (
        $2 = 'MASTER_ADMIN'
        OR o.hierarchy_path = $3 OR o.hierarchy_path LIKE $3 || '.%'
        OR cap.organization_id = $4
        OR da.id IS NOT NULL
      ) AND (
        cc.cnr_number ILIKE $5
        OR cc.court_case_number ILIKE $5
        OR cc.presiding_judge_name ILIKE $5
      )
      LIMIT 10;
    `, [user.userId, user.roleId, user.organizationPath, user.organizationId, searchTerm]),
  ]);

  return res.json({
    results: {
      cases: cases.rows,
      persons: persons.rows,
      evidence: evidence.rows,
      courtCases: courtCases.rows,
    },
  });
});

export default router;
