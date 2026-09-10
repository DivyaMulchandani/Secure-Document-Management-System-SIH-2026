import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { query } from '../services/db';
import { requireAuth } from '../services/auth';
import { authorize } from '../services/authorization';

const router = Router();

// GET /api/organizations/bodies
router.get('/bodies', requireAuth, async (req: Request, res: Response) => {
  const bodies = await query(`
    SELECT b.id, b.name, b.code, b.description, b.created_at,
           COUNT(o.id) as node_count,
           COUNT(u.id) as user_count,
           COUNT(u.id) FILTER (WHERE u.is_layer_admin = TRUE) as admin_count
    FROM organization_bodies b
    LEFT JOIN organization_nodes o ON o.body_id = b.id
    LEFT JOIN users u ON u.primary_organization_id = o.id
    GROUP BY b.id, b.name, b.code, b.description, b.created_at
    ORDER BY CASE b.id 
      WHEN 'POLICE' THEN 1 
      WHEN 'JUDICIARY' THEN 2 
      WHEN 'FORENSICS' THEN 3 
      WHEN 'MASTER' THEN 4 
      ELSE 5 END;
  `);

  return res.json({ bodies: bodies.rows });
});

// GET /api/organizations
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const bodyQuery = req.query.body as string;

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  const conditions: string[] = [];
  const params: any[] = [];

  if (!isMaster) {
    params.push(user.organizationPath);
    conditions.push(`(o.hierarchy_path = $${params.length} OR o.hierarchy_path LIKE $${params.length} || '.%')`);
    params.push(user.agencyBranch);
    conditions.push(`o.agency_branch = $${params.length}`);
  } else if (bodyQuery && ['POLICE', 'FORENSICS', 'JUDICIARY', 'MASTER'].includes(bodyQuery.toUpperCase())) {
    params.push(bodyQuery.toUpperCase());
    conditions.push(`o.body_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const orgs = await query(`
    SELECT o.id, o.parent_id, o.body_id, o.agency_branch, o.type_id, o.name, o.code,
           o.hierarchy_path, o.level, o.jurisdiction_area, o.status,
           t.name as type_name, b.name as body_name
    FROM organization_nodes o
    LEFT JOIN organization_types t ON o.type_id = t.id
    LEFT JOIN organization_bodies b ON o.body_id = b.id
    ${whereClause}
    ORDER BY o.level ASC, o.name ASC;
  `, params);

  return res.json({ organizations: orgs.rows });
});

// GET /api/organizations/node-types
router.get('/node-types', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const bodyQuery = req.query.body as string;
  const filterBody = bodyQuery || (user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN' ? null : user.agencyBranch);

  let types;
  if (filterBody) {
    types = await query(`
      SELECT id, code, name, description, body_id, is_active
      FROM organization_node_types
      WHERE is_active = TRUE AND (body_id IS NULL OR body_id = $1)
      ORDER BY name ASC;
    `, [filterBody.toUpperCase()]);
  } else {
    types = await query(`
      SELECT id, code, name, description, body_id, is_active
      FROM organization_node_types
      WHERE is_active = TRUE
      ORDER BY name ASC;
    `);
  }
  return res.json({ nodeTypes: types.rows, types: types.rows });
});

// GET /api/organizations/office-positions - Extensible catalog of Office Positions for all 3 bodies
router.get('/office-positions', requireAuth, async (req: Request, res: Response) => {
  const bodyQuery = req.query.body as string;
  let where = 'WHERE is_active = TRUE';
  const params: any[] = [];

  if (bodyQuery && ['POLICE', 'JUDICIARY', 'FORENSICS', 'MASTER'].includes(bodyQuery.toUpperCase())) {
    params.push(bodyQuery.toUpperCase());
    where += ` AND (body_id = $1 OR body_id IS NULL)`;
  }

  const positionsRes = await query(`
    SELECT id, code, name, description, body_id, is_active, created_at
    FROM organization_node_types
    ${where}
    ORDER BY COALESCE(body_id, 'ALL') ASC, name ASC;
  `, params);

  const grouped: Record<string, any[]> = {
    POLICE: [],
    JUDICIARY: [],
    FORENSICS: [],
    ALL: [],
  };

  positionsRes.rows.forEach(p => {
    const b = p.body_id || 'ALL';
    if (grouped[b]) {
      grouped[b].push(p);
    } else {
      grouped[b] = [p];
    }
  });

  return res.json({
    positions: positionsRes.rows,
    grouped,
  });
});

// POST /api/organizations/office-positions - Add new Office Position to catalog
router.post('/office-positions', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const { code, name, description, bodyId } = req.body;

  if (!code || !name || !bodyId) {
    return res.status(400).json({ error: 'Validation Error', message: 'Position code, name, and bodyId are required' });
  }

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  if (!isMaster && user.agencyBranch !== bodyId) {
    return res.status(403).json({ error: 'Institutional Boundary Violation', message: 'Cannot add office positions to another sovereign agency body' });
  }

  const cleanCode = code.toUpperCase().replace(/\s+/g, '_');
  try {
    const newPos = await query(`
      INSERT INTO organization_node_types (id, code, name, description, body_id, is_active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, body_id = EXCLUDED.body_id
      RETURNING *;
    `, [cleanCode, cleanCode, name, description || '', bodyId.toUpperCase()]);

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata
      )
      VALUES ($1, $1, $2, $2, $3, 'OFFICE_POSITION_CREATED', 'OFFICE_POSITION', $4, 'ALLOW', $5, $6, json_build_object('code', $4::text, 'name', $7::text));
    `, [user.userId, user.organizationId, bodyId, cleanCode, req.ip, req.headers['user-agent'], name]);

    return res.status(201).json({ success: true, position: newPos.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// GET /api/organizations/admin-levels - List all administrative hierarchy tiers
router.get('/admin-levels', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const bodyQuery = req.query.body as string;

  const conditions: string[] = [];
  const params: any[] = [];

  if (bodyQuery && ['POLICE', 'FORENSICS', 'JUDICIARY', 'MASTER'].includes(bodyQuery.toUpperCase())) {
    params.push(bodyQuery.toUpperCase());
    conditions.push(`al.body_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const levelsRes = await query(`
    SELECT al.id, al.level_number, al.body_id, al.name, al.description,
           al.clearance_required, al.can_manage_subordinates, al.created_at,
           b.name as body_name,
           (SELECT COUNT(*) FROM organization_nodes o WHERE o.admin_level_id = al.id) as mapped_office_count,
           (SELECT COUNT(*) FROM users u JOIN organization_nodes o ON u.primary_organization_id = o.id WHERE o.admin_level_id = al.id AND (u.is_layer_admin = TRUE OR u.primary_role_id LIKE '%ADMIN%')) as admin_count
    FROM admin_levels al
    LEFT JOIN organization_bodies b ON al.body_id = b.id
    ${whereClause}
    ORDER BY al.body_id ASC, al.level_number ASC;
  `, params);

  const grouped: Record<string, any[]> = {
    POLICE: [],
    JUDICIARY: [],
    FORENSICS: [],
    MASTER: [],
  };

  levelsRes.rows.forEach(l => {
    const b = l.body_id || 'MASTER';
    if (grouped[b]) grouped[b].push(l);
    else grouped[b] = [l];
  });

  return res.json({
    adminLevels: levelsRes.rows,
    grouped,
  });
});

// POST /api/organizations/admin-levels - Define or update an admin level
router.post('/admin-levels', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const { id, levelNumber, bodyId, name, description, clearanceRequired } = req.body;

  if (!levelNumber || !bodyId || !name) {
    return res.status(400).json({ error: 'Validation Error', message: 'levelNumber, bodyId, and name are required' });
  }

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  if (!isMaster && user.agencyBranch !== bodyId) {
    return res.status(403).json({ error: 'Access Denied', message: 'Cannot configure admin levels for another sovereign agency' });
  }

  const levelId = id || `${bodyId.toUpperCase()}_L${levelNumber}_${name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 20)}`;

  try {
    const ins = await query(`
      INSERT INTO admin_levels (id, level_number, body_id, name, description, clearance_required, can_manage_subordinates)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      ON CONFLICT (id) DO UPDATE
      SET level_number = EXCLUDED.level_number, body_id = EXCLUDED.body_id, name = EXCLUDED.name,
          description = EXCLUDED.description, clearance_required = EXCLUDED.clearance_required
      RETURNING *;
    `, [levelId, parseInt(levelNumber, 10), bodyId.toUpperCase(), name, description || '', clearanceRequired || 'SECRET']);

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata
      )
      VALUES ($1, $1, $2, $2, $3, 'ADMIN_LEVEL_CONFIGURED', 'ADMIN_LEVEL', $4, 'ALLOW', $5, $6, json_build_object('name', $7::text, 'level', $8::int));
    `, [user.userId, user.organizationId, bodyId, levelId, req.ip, req.headers['user-agent'], name, levelNumber]);

    return res.status(201).json({ success: true, adminLevel: ins.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// PUT /api/organizations/nodes/:id/admin-level - Map admin level to office node
router.put('/nodes/:id/admin-level', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const nodeId = req.params.id;
  const { adminLevelId } = req.body;

  const nodeRes = await query(`SELECT * FROM organization_nodes WHERE id = $1;`, [nodeId]);
  if (nodeRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Organization node not found' });
  }
  const node = nodeRes.rows[0];

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  const isWithinScope = isMaster || (
    node.agency_branch === user.agencyBranch &&
    (node.hierarchy_path === user.organizationPath || node.hierarchy_path.startsWith(user.organizationPath + '.'))
  );

  if (!isWithinScope || !user.permissions.includes('ORG_UPDATE')) {
    return res.status(403).json({ error: 'Access Denied', message: 'Not authorized to map admin level on this office' });
  }

  if (adminLevelId) {
    const alRes = await query(`SELECT id FROM admin_levels WHERE id = $1;`, [adminLevelId]);
    if (alRes.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Admin level not found' });
    }
  }

  await query(`
    UPDATE organization_nodes
    SET admin_level_id = $1, updated_at = NOW()
    WHERE id = $2;
  `, [adminLevelId || null, nodeId]);

  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata
    )
    VALUES ($1, $1, $2, $2, $3, 'OFFICE_ADMIN_LEVEL_MAPPED', 'ORG', $4, 'ALLOW', $5, $6, json_build_object('admin_level_id', $7::text));
  `, [user.userId, nodeId, node.body_id, nodeId, req.ip, req.headers['user-agent'], adminLevelId]);

  return res.json({ success: true, message: 'Office admin level mapped successfully', adminLevelId });
});

// GET /api/organizations/tags - List all organization tags
router.get('/tags', requireAuth, async (req: Request, res: Response) => {
  const tagsRes = await query(`
    SELECT t.id, t.name, t.slug, t.color, t.body_id, t.category, t.description, t.created_at,
           COUNT(nt.node_id) as office_count
    FROM organization_tags t
    LEFT JOIN node_tags nt ON t.id = nt.tag_id
    GROUP BY t.id, t.name, t.slug, t.color, t.body_id, t.category, t.description, t.created_at
    ORDER BY t.name ASC;
  `);

  return res.json({ tags: tagsRes.rows });
});

// POST /api/organizations/tags - Create a new tag
router.post('/tags', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const { name, color, category, description, bodyId } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Validation Error', message: 'Tag name is required' });
  }

  const cleanName = name.trim();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  try {
    const ins = await query(`
      INSERT INTO organization_tags (name, slug, color, category, description, body_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name, color = EXCLUDED.color, category = EXCLUDED.category, description = EXCLUDED.description
      RETURNING *;
    `, [cleanName, slug, color || 'slate', category || 'OFFICE', description || '', bodyId || null]);

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata
      )
      VALUES ($1, $1, $2, $2, $3, 'TAG_CREATED', 'TAG', $4, 'ALLOW', $5, $6, json_build_object('name', $7::text, 'slug', $8::text));
    `, [user.userId, user.organizationId, user.agencyBranch, ins.rows[0].id, req.ip, req.headers['user-agent'], cleanName, slug]);

    return res.status(201).json({ success: true, tag: ins.rows[0] });
  } catch (err: any) {
    return res.status(500).json({ error: 'Database Error', message: err.message });
  }
});

// DELETE /api/organizations/tags/:id - Delete a tag
router.delete('/tags/:id', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const tagId = req.params.id;

  const tagRes = await query(`SELECT * FROM organization_tags WHERE id = $1;`, [tagId]);
  if (tagRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Tag not found' });
  }

  await query(`DELETE FROM organization_tags WHERE id = $1;`, [tagId]);

  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata
    )
    VALUES ($1, $1, $2, $2, $3, 'TAG_DELETED', 'TAG', $4, 'ALLOW', $5, $6, json_build_object('name', $7::text));
  `, [user.userId, user.organizationId, user.agencyBranch, tagId, req.ip, req.headers['user-agent'], tagRes.rows[0].name]);

  return res.json({ success: true, message: 'Tag deleted successfully' });
});

// POST /api/organizations/nodes/:id/tags - Attach tag to office node
router.post('/nodes/:id/tags', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const nodeId = req.params.id;
  const { tagId } = req.body;

  if (!tagId) {
    return res.status(400).json({ error: 'Validation Error', message: 'tagId is required' });
  }

  const nodeRes = await query(`SELECT * FROM organization_nodes WHERE id = $1;`, [nodeId]);
  if (nodeRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Node not found' });

  const tagRes = await query(`SELECT * FROM organization_tags WHERE id = $1;`, [tagId]);
  if (tagRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Tag not found' });

  await query(`
    INSERT INTO node_tags (node_id, tag_id)
    VALUES ($1, $2)
    ON CONFLICT DO NOTHING;
  `, [nodeId, tagId]);

  return res.json({ success: true, message: 'Tag attached to office' });
});

// DELETE /api/organizations/nodes/:id/tags/:tagId - Detach tag from office node
router.delete('/nodes/:id/tags/:tagId', requireAuth, async (req: Request, res: Response) => {
  const nodeId = req.params.id;
  const tagId = req.params.tagId;

  await query(`
    DELETE FROM node_tags WHERE node_id = $1 AND tag_id = $2;
  `, [nodeId, tagId]);

  return res.json({ success: true, message: 'Tag detached from office' });
});

// Helper for tree retrieval
async function handleGetTree(req: Request, res: Response, targetBodyParam?: string) {
  const user = req.userSession!;
  const bodyQuery = (targetBodyParam || req.query.body as string || '').toUpperCase();

  const conditions: string[] = [];
  const params: any[] = [];

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  if (!isMaster) {
    params.push(user.organizationPath);
    conditions.push(`(o.hierarchy_path = $${params.length} OR o.hierarchy_path LIKE $${params.length} || '.%')`);
    params.push(user.agencyBranch);
    conditions.push(`o.agency_branch = $${params.length}`);
  } else if (bodyQuery && ['POLICE', 'FORENSICS', 'JUDICIARY', 'MASTER'].includes(bodyQuery)) {
    params.push(bodyQuery);
    conditions.push(`o.body_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const orgs = await query(`
    SELECT o.id, o.parent_id, o.body_id, o.agency_branch, o.type_id, o.node_type_id, o.name, o.code,
           o.hierarchy_path, o.level, o.jurisdiction_area, o.status, o.metadata, o.admin_level_id,
           t.name as type_name, b.name as body_name,
           al.name as admin_level_name, al.level_number as admin_level_number,
           COALESCE(
             (SELECT json_agg(json_build_object('id', tg.id, 'name', tg.name, 'slug', tg.slug, 'color', tg.color, 'category', tg.category))
              FROM node_tags ntg
              JOIN organization_tags tg ON ntg.tag_id = tg.id
              WHERE ntg.node_id = o.id),
             '[]'::json
           ) as tags,
           (SELECT COUNT(*) FROM users u WHERE u.primary_organization_id = o.id) as user_count,
           (SELECT COUNT(*) FROM users u WHERE u.primary_organization_id = o.id AND (u.is_layer_admin = TRUE OR u.primary_role_id LIKE '%ADMIN%')) as admin_count,
           (SELECT COUNT(*) FROM organization_nodes ch WHERE ch.parent_id = o.id) as child_count,
           (SELECT COUNT(*) FROM cases c WHERE c.originating_organization_id = o.id) as case_count
    FROM organization_nodes o
    LEFT JOIN organization_types t ON o.type_id = t.id
    LEFT JOIN organization_bodies b ON o.body_id = b.id
    LEFT JOIN admin_levels al ON o.admin_level_id = al.id
    ${whereClause}
    ORDER BY o.level ASC, o.name ASC;
  `, params);

  // Build recursive tree
  const items = orgs.rows;
  const itemMap = new Map();
  items.forEach(i => itemMap.set(i.id, { ...i, children: [] }));

  let rootNodes: any[] = [];
  items.forEach(i => {
    const node = itemMap.get(i.id);
    if (i.parent_id && itemMap.has(i.parent_id)) {
      itemMap.get(i.parent_id).children.push(node);
    } else {
      rootNodes.push(node);
    }
  });

  return res.json({ tree: rootNodes, organizations: items });
}

// GET /api/organizations/tree
router.get('/tree', requireAuth, (req, res) => handleGetTree(req, res));

// Explicit sovereign tree endpoints as specified in prompt:
// GET /api/organizations/police/tree
// GET /api/organizations/judiciary/tree
// GET /api/organizations/forensics/tree
router.get('/police/tree', requireAuth, (req, res) => handleGetTree(req, res, 'POLICE'));
router.get('/judiciary/tree', requireAuth, (req, res) => handleGetTree(req, res, 'JUDICIARY'));
router.get('/forensics/tree', requireAuth, (req, res) => handleGetTree(req, res, 'FORENSICS'));
router.get('/master/tree', requireAuth, (req, res) => handleGetTree(req, res, 'MASTER'));

// GET /api/organizations/nodes/:id or /:id (Node Details Inspector)
async function handleGetNodeDetails(req: Request, res: Response) {
  const user = req.userSession!;
  const nodeId = req.params.id;

  const nodeRes = await query(`
    SELECT o.id, o.parent_id, o.body_id, o.agency_branch, o.type_id, o.node_type_id, o.name, o.code,
           o.hierarchy_path, o.level, o.jurisdiction_area, o.status, o.metadata, o.admin_level_id, o.created_at, o.updated_at,
           t.name as type_name, b.name as body_name,
           al.name as admin_level_name, al.level_number as admin_level_number,
           p.name as parent_name, p.code as parent_code
    FROM organization_nodes o
    LEFT JOIN organization_types t ON o.type_id = t.id
    LEFT JOIN organization_bodies b ON o.body_id = b.id
    LEFT JOIN admin_levels al ON o.admin_level_id = al.id
    LEFT JOIN organization_nodes p ON o.parent_id = p.id
    WHERE o.id = $1;
  `, [nodeId]);

  if (nodeRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Organization node not found' });
  }

  const node = nodeRes.rows[0];

  // Fetch immediate children
  const childrenRes = await query(`
    SELECT id, name, code, type_id, node_type_id, level, status, admin_level_id
    FROM organization_nodes
    WHERE parent_id = $1
    ORDER BY name ASC;
  `, [nodeId]);

  // Fetch administrators assigned to this node
  const adminsRes = await query(`
    SELECT u.id, u.username, u.display_name, u.badge_number, u.government_id, u.designation, u.status,
           r.id as role_id, r.name as role_name
    FROM users u
    JOIN roles r ON u.primary_role_id = r.id
    WHERE u.primary_organization_id = $1 AND (u.is_layer_admin = TRUE OR r.id LIKE '%ADMIN%')
    ORDER BY u.display_name ASC;
  `, [nodeId]);

  // Fetch regular users assigned to this node
  const usersRes = await query(`
    SELECT u.id, u.username, u.display_name, u.badge_number, u.government_id, u.designation, u.status,
           r.id as role_id, r.name as role_name
    FROM users u
    JOIN roles r ON u.primary_role_id = r.id
    WHERE u.primary_organization_id = $1 AND u.is_layer_admin = FALSE AND r.id NOT LIKE '%ADMIN%'
    ORDER BY u.display_name ASC;
  `, [nodeId]);

  // Fetch tags attached to this node
  const tagsRes = await query(`
    SELECT t.id, t.name, t.slug, t.color, t.category, t.description
    FROM organization_tags t
    JOIN node_tags nt ON t.id = nt.tag_id
    WHERE nt.node_id = $1
    ORDER BY t.name ASC;
  `, [nodeId]);

  // Compute permissions for caller on this node
  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  const isWithinScope = isMaster || (
    node.agency_branch === user.agencyBranch &&
    (node.hierarchy_path === user.organizationPath || node.hierarchy_path.startsWith(user.organizationPath + '.'))
  );

  const permissions = {
    canCreateChildNode: isWithinScope && user.permissions.includes('ORG_CREATE'),
    canCreateAdmin: isWithinScope && user.permissions.includes('USER_CREATE') && (user.isLayerAdmin || user.roleId.includes('ADMIN')),
    canCreateUser: isWithinScope && user.permissions.includes('USER_CREATE'),
    canEditNode: isWithinScope && user.permissions.includes('ORG_UPDATE'),
    canDisableNode: isWithinScope && user.permissions.includes('ORG_UPDATE'),
    canDeleteNode: isWithinScope && user.permissions.includes('ORG_UPDATE') && !!node.parent_id && node.level > 1,
  };

  return res.json({
    organization: node,
    parent: node.parent_id ? { id: node.parent_id, name: node.parent_name, code: node.parent_code } : null,
    children: childrenRes.rows,
    administrators: adminsRes.rows,
    users: usersRes.rows,
    tags: tagsRes.rows,
    permissions,
  });
}

router.get('/nodes/:id', requireAuth, handleGetNodeDetails);
router.get('/:id', requireAuth, handleGetNodeDetails);

// Helper for deleting an office node
async function handleDeleteNode(req: Request, res: Response) {
  const user = req.userSession!;
  const nodeId = req.params.id;

  const nodeRes = await query(`SELECT * FROM organization_nodes WHERE id = $1;`, [nodeId]);
  if (nodeRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Organization node not found' });
  }
  const node = nodeRes.rows[0];

  if (!node.parent_id || node.level === 1) {
    return res.status(400).json({
      error: 'Protected Sovereign Node',
      message: 'Sovereign root nodes (Level 1 Apex) cannot be deleted.',
    });
  }

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';
  const isWithinScope = isMaster || (
    node.agency_branch === user.agencyBranch &&
    (node.hierarchy_path === user.organizationPath || node.hierarchy_path.startsWith(user.organizationPath + '.'))
  );

  if (!isWithinScope || !user.permissions.includes('ORG_UPDATE')) {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'You do not have administrative authority to delete this organization node.',
    });
  }

  // Check child offices
  const childCountRes = await query(`SELECT COUNT(*) as count FROM organization_nodes WHERE parent_id = $1;`, [nodeId]);
  const childCount = parseInt(childCountRes.rows[0].count, 10);
  if (childCount > 0) {
    return res.status(400).json({
      error: 'Dependency Violation',
      message: `Cannot delete office '${node.name}': ${childCount} subordinate child office(s) exist under this node. Delete or reassign child offices first.`,
      childCount,
    });
  }

  // Check assigned personnel
  const userCountRes = await query(`SELECT COUNT(*) as count FROM users WHERE primary_organization_id = $1;`, [nodeId]);
  const userCount = parseInt(userCountRes.rows[0].count, 10);
  if (userCount > 0) {
    return res.status(400).json({
      error: 'Dependency Violation',
      message: `Cannot delete office '${node.name}': ${userCount} personnel are currently assigned to this office. Reassign personnel first.`,
      userCount,
    });
  }

  // Delete node
  await query(`DELETE FROM organization_nodes WHERE id = $1;`, [nodeId]);

  // Audit log
  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata
    )
    VALUES ($1, $1, $2, $2, $3, 'NODE_DELETED', 'ORG', $4, 'ALLOW', $5, $6, json_build_object('name', $7::text, 'code', $8::text, 'level', $9::int));
  `, [user.userId, nodeId, node.body_id, nodeId, req.ip, req.headers['user-agent'], node.name, node.code, node.level]);

  return res.json({ success: true, message: `Office '${node.name}' (${node.code}) deleted successfully.` });
}

router.delete('/nodes/:id', requireAuth, handleDeleteNode);
router.delete('/:id', requireAuth, handleDeleteNode);

// Helper for updating node
async function handleUpdateNode(req: Request, res: Response) {
  const user = req.userSession!;
  const nodeId = req.params.id;
  const { name, jurisdictionArea, metadata } = req.body;

  const nodeRes = await query(`SELECT * FROM organization_nodes WHERE id = $1;`, [nodeId]);
  if (nodeRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Organization node not found' });
  }
  const node = nodeRes.rows[0];

  const authz = await authorize(user, 'ORG_UPDATE', { type: 'ORG', owningOrgId: nodeId }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  await query(`
    UPDATE organization_nodes
    SET name = COALESCE($1, name),
        jurisdiction_area = COALESCE($2, jurisdiction_area),
        metadata = COALESCE($3, metadata),
        updated_at = NOW()
    WHERE id = $4;
  `, [name, jurisdictionArea, metadata ? JSON.stringify(metadata) : null, nodeId]);

  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
    )
    VALUES ($1, $1, $2, $2, $3, 'NODE_UPDATED', 'ORG', $4, 'ALLOW', $5, $6, $7::jsonb, $7::jsonb);
  `, [user.userId, nodeId, node.body_id, nodeId, req.ip, req.headers['user-agent'], JSON.stringify({ name, jurisdictionArea })]);

  return res.json({ success: true, message: 'Organization node updated successfully' });
}

router.put('/nodes/:id', requireAuth, handleUpdateNode);
router.put('/:id', requireAuth, handleUpdateNode);

// Helper for updating node status / disabling
async function handleUpdateNodeStatus(req: Request, res: Response) {
  const user = req.userSession!;
  const nodeId = req.params.id;
  const { status } = req.body;

  if (!['ACTIVE', 'INACTIVE', 'DISABLED'].includes(status)) {
    return res.status(400).json({ error: 'Validation Error', message: 'Invalid status' });
  }

  const nodeRes = await query(`SELECT * FROM organization_nodes WHERE id = $1;`, [nodeId]);
  if (nodeRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Organization node not found' });
  }
  const node = nodeRes.rows[0];

  const authz = await authorize(user, 'ORG_UPDATE', { type: 'ORG', owningOrgId: nodeId }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  await query(`
    UPDATE organization_nodes
    SET status = $1, updated_at = NOW()
    WHERE id = $2;
  `, [status, nodeId]);

  const auditAction = status === 'DISABLED' ? 'NODE_DISABLED' : 'NODE_STATUS_UPDATED';

  await query(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
    )
    VALUES ($1, $1, $2, $2, $3, $4, 'ORG', $5, 'ALLOW', $6, $7, $8::jsonb, $8::jsonb);
  `, [user.userId, nodeId, node.body_id, auditAction, nodeId, req.ip, req.headers['user-agent'], JSON.stringify({ status })]);

  return res.json({ success: true, message: `Node status updated to ${status}` });
}

router.put('/nodes/:id/status', requireAuth, handleUpdateNodeStatus);
router.put('/:id/status', requireAuth, handleUpdateNodeStatus);

// Helper for creating node
async function handleCreateNode(req: Request, res: Response) {
  const user = req.userSession!;
  const { parentId, typeId, name, code, jurisdictionArea, metadata } = req.body;

  if (!parentId || !typeId || !name || !code) {
    return res.status(400).json({ error: 'Validation Error', message: 'Missing required fields' });
  }

  // Parent must exist
  const parentRes = await query(`
    SELECT id, hierarchy_path, level, agency_branch, body_id FROM organization_nodes WHERE id = $1;
  `, [parentId]);

  if (parentRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Parent organization not found' });
  }

  const parent = parentRes.rows[0];

  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  // Non-master administrators must remain within their vertical subtree and agency branch
  if (!isMaster) {
    if (parent.agency_branch !== user.agencyBranch) {
      return res.status(403).json({
        error: 'Institutional Boundary Violation',
        message: `Cannot create nodes in agency '${parent.agency_branch}' from agency '${user.agencyBranch}'.`,
      });
    }

    const isWithinSubtree = parent.hierarchy_path === user.organizationPath ||
      parent.hierarchy_path.startsWith(user.organizationPath + '.');
    if (!isWithinSubtree) {
      return res.status(403).json({
        error: 'Access Denied',
        message: 'Sibling Isolation Policy: You cannot create child nodes outside your descendant subtree.',
      });
    }
  }

  // Authorize creation
  const authz = await authorize(user, 'ORG_CREATE', { type: 'ORG', owningOrgId: parentId }, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  if (!authz.allowed) {
    return res.status(authz.statusCode).json({ error: 'Access Denied', message: authz.reason });
  }

  const cleanCode = code.toUpperCase().replace(/\s+/g, '-');
  const pathPart = cleanCode.toLowerCase().replace(/-/g, '_');
  const hierarchyPath = `${parent.hierarchy_path}.${pathPart}`;
  const level = parent.level + 1;

  try {
    const newOrg = await query(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, node_type_id, name, code, hierarchy_path, level, jurisdiction_area, metadata
      )
      VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *;
    `, [parentId, parent.body_id, parent.agency_branch, typeId, name, cleanCode, hierarchyPath, level, jurisdictionArea || '', metadata ? JSON.stringify(metadata) : '{}']);

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata, after_value
      )
      VALUES ($1, $1, $2, $2, $3, 'NODE_CREATED', 'ORG', $4, 'ALLOW', $5, $6, $7::jsonb, $7::jsonb);
    `, [user.userId, newOrg.rows[0].id, parent.body_id, newOrg.rows[0].id, req.ip, req.headers['user-agent'], JSON.stringify({ name, code: cleanCode })]);

    return res.status(201).json({ success: true, organization: newOrg.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'Organization code already exists' });
    }
    return res.status(500).json({ error: 'Server Error', message: 'Failed to create organization' });
  }
}

// Outline parser for layer-wise office names
export function parseOfficeOutline(text: string): Array<{ name: string; rawLevel: number; parentIndex: number | null }> {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const result: Array<{ name: string; rawLevel: number; parentIndex: number | null }> = [];
  const levelStack: Array<{ level: number; index: number }> = [];

  for (const line of lines) {
    const leadingSpacesMatch = line.match(/^(\s*)/);
    const leadingSpaces = leadingSpacesMatch ? leadingSpacesMatch[1] : '';
    let indentDepth = 0;
    for (const char of leadingSpaces) {
      indentDepth += char === '\t' ? 4 : 1;
    }

    let cleanName = line.trim();
    const prefixMatch = cleanName.match(/^(?:Layer|Level|L)\s*([1-9])\s*[:\-.]?\s*(.*)$/i);
    let explicitLevel: number | null = null;
    if (prefixMatch) {
      explicitLevel = parseInt(prefixMatch[1], 10);
      cleanName = prefixMatch[2].trim();
    } else {
      cleanName = cleanName.replace(/^[-*•\d.]+\s+/, '').trim();
    }

    let rawLevel = explicitLevel !== null ? explicitLevel : Math.floor(indentDepth / 2) + 1;

    while (levelStack.length > 0 && levelStack[levelStack.length - 1].level >= rawLevel) {
      levelStack.pop();
    }

    const parentIndex = levelStack.length > 0 ? levelStack[levelStack.length - 1].index : null;
    const currentIndex = result.length;

    result.push({
      name: cleanName,
      rawLevel,
      parentIndex,
    });

    levelStack.push({ level: rawLevel, index: currentIndex });
  }

  return result;
}

function generateCleanCode(name: string, bodyId: string): string {
  const bodyPrefix = bodyId === 'POLICE' ? 'POL' : bodyId === 'JUDICIARY' ? 'JUD' : bodyId === 'FORENSICS' ? 'FSL' : 'LEA';
  const clean = name.toUpperCase()
    .replace(/COMMISSIONERATE/g, 'COMM')
    .replace(/POLICE STATION/g, 'PS')
    .replace(/HEADQUARTERS/g, 'HQ')
    .replace(/DIVISION/g, 'DIV')
    .replace(/DISTRICT/g, 'DIST')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join('-');
  return `GJ-${bodyPrefix}-${clean || 'OFFICE'}`.slice(0, 50);
}

function resolveDefaultTypeId(bodyId: string, level: number): string {
  if (bodyId === 'POLICE') {
    if (level === 1) return 'STATE_HQ';
    if (level === 2) return 'COMMISSIONERATE';
    if (level === 3) return 'DIVISION';
    return 'POLICE_STATION';
  }
  if (bodyId === 'JUDICIARY') {
    if (level === 1) return 'HIGH_COURT';
    if (level === 2) return 'DISTRICT_COURT';
    if (level === 3) return 'TALUKA_COURT';
    return 'SPECIAL_COURT';
  }
  if (bodyId === 'FORENSICS') {
    if (level === 1) return 'STATE_FSL';
    if (level === 2) return 'REGIONAL_FSL';
    return 'MOBILE_LAB';
  }
  return 'MASTER_APEX';
}

// POST /api/organizations/batch-layer-import - Layer-wise Hierarchy Builder & Bulk Importer
router.post('/batch-layer-import', requireAuth, async (req: Request, res: Response) => {
  const user = req.userSession!;
  const isMaster = user.roleId === 'MASTER_ADMIN' || user.roleId === 'SYSTEM_MASTER_ADMIN';

  const {
    bodyId: rawBodyId,
    rootParentId,
    textOutline,
    nodes: rawNodes,
    dryRun = false,
  } = req.body;

  const bodyId = (rawBodyId || user.agencyBranch || 'POLICE').toUpperCase();

  // Non-master administrators must operate strictly within their sovereign body
  if (!isMaster && bodyId !== user.agencyBranch) {
    return res.status(403).json({
      error: 'Institutional Boundary Violation',
      message: `Cannot bulk import hierarchy into sovereign agency '${bodyId}' from agency '${user.agencyBranch}'.`,
    });
  }

  // Authorize
  if (!user.permissions.includes('ORG_CREATE') && !isMaster && !user.isLayerAdmin) {
    return res.status(403).json({
      error: 'Access Denied',
      message: 'You lack the administrative authority (ORG_CREATE) to build organization hierarchies.',
    });
  }

  // Parse input nodes either from text outline or explicit array
  let inputNodes: Array<{
    name: string;
    code?: string;
    level?: number;
    parentIndex?: number | null;
    parentId?: string | null;
    typeId?: string;
    jurisdictionArea?: string;
  }> = [];

  if (textOutline && typeof textOutline === 'string' && textOutline.trim()) {
    const parsed = parseOfficeOutline(textOutline);
    inputNodes = parsed.map(p => ({
      name: p.name,
      level: p.rawLevel,
      parentIndex: p.parentIndex,
    }));
  } else if (Array.isArray(rawNodes) && rawNodes.length > 0) {
    inputNodes = rawNodes;
  } else {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Either textOutline (indented list) or nodes array is required for batch hierarchy construction.',
    });
  }

  // Validate root parent if provided
  let rootParent: any = null;
  if (rootParentId) {
    const pRes = await query(`SELECT * FROM organization_nodes WHERE id = $1;`, [rootParentId]);
    if (pRes.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Specified root parent office not found.' });
    }
    rootParent = pRes.rows[0];
    if (!isMaster && rootParent.agency_branch !== user.agencyBranch) {
      return res.status(403).json({ error: 'Boundary Violation', message: 'Parent office belongs to a different sovereign body.' });
    }
  } else {
    // Default root to level 1 Apex node of this body
    const apexRes = await query(`SELECT * FROM organization_nodes WHERE body_id = $1 AND level = 1 ORDER BY created_at ASC LIMIT 1;`, [bodyId]);
    if (apexRes.rows.length > 0) {
      rootParent = apexRes.rows[0];
    }
  }

  // Perform Preview / Dry Run Computation
  const previewItems: any[] = [];
  const usedCodes = new Set<string>();

  for (let i = 0; i < inputNodes.length; i++) {
    const node = inputNodes[i];
    let baseCode = node.code ? node.code.toUpperCase().replace(/\s+/g, '-') : generateCleanCode(node.name, bodyId);
    let finalCode = baseCode;
    let counter = 1;
    while (usedCodes.has(finalCode)) {
      finalCode = `${baseCode}-${counter++}`;
    }
    usedCodes.add(finalCode);

    let parentName = 'Apex Root';
    let parentPath = rootParent ? rootParent.hierarchy_path : bodyId;
    let nodeLevel = rootParent ? rootParent.level + 1 : 1;

    if (node.parentIndex !== null && node.parentIndex !== undefined && previewItems[node.parentIndex]) {
      const parentItem = previewItems[node.parentIndex];
      parentName = parentItem.name;
      parentPath = parentItem.hierarchyPath;
      nodeLevel = parentItem.level + 1;
    } else if (node.level) {
      nodeLevel = rootParent ? Math.max(rootParent.level + 1, node.level) : node.level;
    }

    const pathPart = finalCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const hierarchyPath = `${parentPath}.${pathPart}`;
    const typeId = node.typeId || resolveDefaultTypeId(bodyId, nodeLevel);

    previewItems.push({
      index: i,
      name: node.name,
      code: finalCode,
      level: nodeLevel,
      parentIndex: node.parentIndex ?? null,
      parentName,
      hierarchyPath,
      typeId,
      bodyId,
      jurisdictionArea: node.jurisdictionArea || '',
    });
  }

  if (dryRun) {
    return res.json({
      success: true,
      dryRun: true,
      count: previewItems.length,
      rootParent: rootParent ? { id: rootParent.id, name: rootParent.name, code: rootParent.code } : null,
      preview: previewItems,
    });
  }

  // Live Batch Commit Execution
  const createdNodes: any[] = [];
  const indexToCreated = new Map<number, any>();

  try {
    for (let i = 0; i < previewItems.length; i++) {
      const item = previewItems[i];

      // Determine parent node in DB
      let effectiveParentId: string | null = null;
      let effectiveParentPath: string = bodyId;
      let effectiveLevel = item.level;

      if (item.parentIndex !== null && indexToCreated.has(item.parentIndex)) {
        const createdParent = indexToCreated.get(item.parentIndex);
        effectiveParentId = createdParent.id;
        effectiveParentPath = createdParent.hierarchy_path;
        effectiveLevel = createdParent.level + 1;
      } else if (rootParent) {
        effectiveParentId = rootParent.id;
        effectiveParentPath = rootParent.hierarchy_path;
        effectiveLevel = rootParent.level + 1;
      }

      // Ensure code is unique in DB
      let finalCode = item.code;
      const existingCheck = await query(`SELECT id FROM organization_nodes WHERE code = $1;`, [finalCode]);
      if (existingCheck.rows.length > 0) {
        finalCode = `${item.code}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      }

      const pathPart = finalCode.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const hierarchyPath = `${effectiveParentPath}.${pathPart}`;

      const ins = await query(`
        INSERT INTO organization_nodes (
          parent_id, body_id, agency_branch, type_id, node_type_id, name, code, hierarchy_path, level, jurisdiction_area, metadata
        )
        VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area, status;
      `, [
        effectiveParentId,
        bodyId,
        bodyId,
        item.typeId,
        item.name,
        finalCode,
        hierarchyPath,
        effectiveLevel,
        item.jurisdictionArea || '',
        JSON.stringify({ batchImportedAt: new Date().toISOString() })
      ]);

      const created = ins.rows[0];
      createdNodes.push(created);
      indexToCreated.set(i, created);
    }

    // Audit batch import action
    const auditMeta = JSON.stringify({
      count: createdNodes.length,
      bodyId,
      rootParentId: rootParent?.id || null,
      topCodes: createdNodes.slice(0, 5).map(c => c.code),
    });

    await query(`
      INSERT INTO audit_logs (
        user_id, actor_user_id, organization_id, organization_node_id, body_id,
        action, resource_type, resource_id, result, ip_address, user_agent, metadata
      )
      VALUES ($1, $1, $2, $2, $3, 'NODE_BATCH_IMPORTED', 'ORG_BATCH', $4, 'ALLOW', $5, $6, $7::jsonb);
    `, [
      user.userId,
      user.organizationId,
      bodyId,
      `BATCH-${Date.now()}`,
      req.ip,
      req.headers['user-agent'],
      auditMeta
    ]);

    return res.status(201).json({
      success: true,
      message: `Successfully imported ${createdNodes.length} offices layer-by-layer into ${bodyId} hierarchy.`,
      count: createdNodes.length,
      nodes: createdNodes,
    });
  } catch (err: any) {
    console.error('Batch layer import error:', err);
    return res.status(500).json({
      error: 'Batch Import Failed',
      message: err.message,
      createdBeforeFailure: createdNodes.length,
    });
  }
});

// POST /api/organizations
router.post('/', requireAuth, handleCreateNode);

// POST /api/organizations/nodes (alias)
router.post('/nodes', requireAuth, handleCreateNode);

export default router;
