import { Router, Request, Response } from 'express';
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

  const conditions: string[] = [];
  const params: any[] = [];

  if (user.roleId !== 'MASTER_ADMIN') {
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
  return res.json({ nodeTypes: types.rows });
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
           o.hierarchy_path, o.level, o.jurisdiction_area, o.status, o.metadata,
           t.name as type_name, b.name as body_name,
           (SELECT COUNT(*) FROM users u WHERE u.primary_organization_id = o.id) as user_count,
           (SELECT COUNT(*) FROM users u WHERE u.primary_organization_id = o.id AND (u.is_layer_admin = TRUE OR u.primary_role_id LIKE '%ADMIN%')) as admin_count,
           (SELECT COUNT(*) FROM cases c WHERE c.originating_organization_id = o.id) as case_count
    FROM organization_nodes o
    LEFT JOIN organization_types t ON o.type_id = t.id
    LEFT JOIN organization_bodies b ON o.body_id = b.id
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
           o.hierarchy_path, o.level, o.jurisdiction_area, o.status, o.metadata, o.created_at, o.updated_at,
           t.name as type_name, b.name as body_name,
           p.name as parent_name, p.code as parent_code
    FROM organization_nodes o
    LEFT JOIN organization_types t ON o.type_id = t.id
    LEFT JOIN organization_bodies b ON o.body_id = b.id
    LEFT JOIN organization_nodes p ON o.parent_id = p.id
    WHERE o.id = $1;
  `, [nodeId]);

  if (nodeRes.rows.length === 0) {
    return res.status(404).json({ error: 'Not Found', message: 'Organization node not found' });
  }

  const node = nodeRes.rows[0];

  // Fetch immediate children
  const childrenRes = await query(`
    SELECT id, name, code, type_id, node_type_id, level, status
    FROM organization_nodes
    WHERE parent_id = $1
    ORDER BY name ASC;
  `, [nodeId]);

  // Fetch administrators assigned to this node
  const adminsRes = await query(`
    SELECT u.id, u.username, u.display_name, u.badge_number, u.designation, u.status,
           r.id as role_id, r.name as role_name
    FROM users u
    JOIN roles r ON u.primary_role_id = r.id
    WHERE u.primary_organization_id = $1 AND (u.is_layer_admin = TRUE OR r.id LIKE '%ADMIN%')
    ORDER BY u.display_name ASC;
  `, [nodeId]);

  // Fetch regular users assigned to this node
  const usersRes = await query(`
    SELECT u.id, u.username, u.display_name, u.badge_number, u.designation, u.status,
           r.id as role_id, r.name as role_name
    FROM users u
    JOIN roles r ON u.primary_role_id = r.id
    WHERE u.primary_organization_id = $1 AND u.is_layer_admin = FALSE AND r.id NOT LIKE '%ADMIN%'
    ORDER BY u.display_name ASC;
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
  };

  return res.json({
    organization: node,
    parent: node.parent_id ? { id: node.parent_id, name: node.parent_name, code: node.parent_code } : null,
    children: childrenRes.rows,
    administrators: adminsRes.rows,
    users: usersRes.rows,
    permissions,
  });
}

router.get('/nodes/:id', requireAuth, handleGetNodeDetails);
router.get('/:id', requireAuth, handleGetNodeDetails);

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

// POST /api/organizations
router.post('/', requireAuth, handleCreateNode);

// POST /api/organizations/nodes (alias)
router.post('/nodes', requireAuth, handleCreateNode);

export default router;
