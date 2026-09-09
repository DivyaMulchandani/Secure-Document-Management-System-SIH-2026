"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDatabase = seedDatabase;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("./db");
async function seedDatabase() {
    console.log('================================================================');
    console.log('  🏛️  STARTING MULTI-AGENCY PLATFORM REALIGNMENT SEEDING');
    console.log('================================================================');
    await (0, db_1.initDatabase)();
    // 0. Clean premature demo records from case, evidence, forensics, and court tables
    console.log('Cleaning premature demo transaction tables for Milestone 1...');
    await (0, db_1.query)(`
    TRUNCATE TABLE 
      evidence_custody_events,
      evidence,
      forensic_reports,
      forensic_examinations,
      forensic_submissions,
      court_judgements,
      court_orders,
      court_proceedings,
      court_cases,
      panchnamas,
      investigations,
      case_persons,
      persons,
      firs,
      case_agency_participation,
      case_timeline,
      delegated_access,
      documents,
      cases,
      user_sessions,
      ledger_blocks
    CASCADE;
  `);
    // Remove existing users, roles, and scopes so we start with ONLY the System Master Admin
    await (0, db_1.query)(`DELETE FROM admin_scopes;`);
    await (0, db_1.query)(`DELETE FROM user_roles;`);
    await (0, db_1.query)(`DELETE FROM users;`);
    // 1. Sovereign Organization Bodies
    console.log('Seeding sovereign organization bodies...');
    const bodies = [
        {
            id: 'POLICE',
            name: 'Gujarat Police Department',
            code: 'POLICE',
            description: 'Sovereign Law Enforcement & Criminal Investigation Body of Gujarat'
        },
        {
            id: 'JUDICIARY',
            name: 'Gujarat State Judiciary & Courts',
            code: 'JUDICIARY',
            description: 'Sovereign Judicial & Adjudication Body of Gujarat'
        },
        {
            id: 'FORENSICS',
            name: 'Forensic Science Services',
            code: 'FORENSICS',
            description: 'Directorate of Forensic Science Services & State / Regional Laboratories'
        },
        {
            id: 'MASTER',
            name: 'Gujarat State Justice Command (Master Apex)',
            code: 'MASTER',
            description: 'Cross-Agency Apex Governance & Master Identity Administration'
        }
    ];
    for (const b of bodies) {
        await (0, db_1.query)(`
      INSERT INTO organization_bodies (id, name, code, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE 
      SET name = EXCLUDED.name, code = EXCLUDED.code, description = EXCLUDED.description;
    `, [b.id, b.name, b.code, b.description]);
    }
    // 2. Organization Types
    console.log('Seeding organization types...');
    const orgTypes = [
        // MASTER
        { id: 'MASTER_APEX', agency_branch: 'MASTER', name: 'Master Apex Level', description: 'Cross-Agency Root Administration' },
        // POLICE
        { id: 'STATE_HQ', agency_branch: 'POLICE', name: 'State Police Headquarters', description: 'Apex Police Leadership' },
        { id: 'POLICE_WING', agency_branch: 'POLICE', name: 'Specialized Police Wing', description: 'State-level specialized operations' },
        { id: 'COMMISSIONERATE', agency_branch: 'POLICE', name: 'Police Commissionerate', description: 'Metropolitan police command' },
        { id: 'DISTRICT_RANGE', agency_branch: 'POLICE', name: 'District Police Range', description: 'Regional district cluster' },
        { id: 'DISTRICT_POLICE', agency_branch: 'POLICE', name: 'District Police Establishment', description: 'SP Office command' },
        { id: 'BRANCH', agency_branch: 'POLICE', name: 'Specialized Branch', description: 'Crime, Traffic, Cyber branches' },
        { id: 'SECTOR', agency_branch: 'POLICE', name: 'Sector Command', description: 'Zonal supervisory cluster' },
        { id: 'ZONE', agency_branch: 'POLICE', name: 'Police Zone', description: 'DCP Zonal Jurisdiction' },
        { id: 'DIVISION', agency_branch: 'POLICE', name: 'Police Division', description: 'ACP / SDPO Division' },
        { id: 'POLICE_STATION', agency_branch: 'POLICE', name: 'Police Station', description: 'Primary FIR and Investigation unit' },
        { id: 'CHOKI', agency_branch: 'POLICE', name: 'Police Choki / Outpost', description: 'Sub-station operational post' },
        { id: 'BEAT', agency_branch: 'POLICE', name: 'Patrolling Beat', description: 'Ground patrol beat' },
        { id: 'SPECIALIZED_UNIT', agency_branch: 'POLICE', name: 'Specialized Battalion', description: 'SRPF, GRP, Marine Police' },
        // FORENSICS
        { id: 'CENTRAL_DFSS', agency_branch: 'FORENSICS', name: 'Central DFSS / MHA', description: 'Directorate of Forensic Science Services' },
        { id: 'CFSL', agency_branch: 'FORENSICS', name: 'Central Forensic Science Laboratory', description: 'CFSL establishments' },
        { id: 'STATE_FSL_HQ', agency_branch: 'FORENSICS', name: 'State FSL Directorate HQ', description: 'Gujarat SFSL Gandhinagar' },
        { id: 'SCIENTIFIC_DIVISION', agency_branch: 'FORENSICS', name: 'Scientific Division', description: 'Ballistics, DNA, Cyber, Chemistry, etc.' },
        { id: 'REGIONAL_FSL', agency_branch: 'FORENSICS', name: 'Regional Forensic Science Lab', description: 'RFSL Zonal Lab' },
        { id: 'MOBILE_FSL', agency_branch: 'FORENSICS', name: 'District Forensic Mobile Unit', description: 'Scene-of-crime rapid response unit' },
        { id: 'ACADEMIC_INSTITUTE', agency_branch: 'FORENSICS', name: 'Forensic University / Training', description: 'NFSU and campuses' },
        // JUDICIARY
        { id: 'STATE_APEX_JUDICIARY', agency_branch: 'JUDICIARY', name: 'State Apex Judiciary', description: 'High Court of Gujarat' },
        { id: 'STATE_TRIBUNAL', agency_branch: 'JUDICIARY', name: 'State Tribunal / Commission', description: 'Revenue, Industrial, Consumer tribunals' },
        { id: 'DISTRICT_COURT_ESTABLISHMENT', agency_branch: 'JUDICIARY', name: 'District Court Establishment', description: 'Principal District & Sessions Court' },
        { id: 'SPECIALIZED_COURT', agency_branch: 'JUDICIARY', name: 'Specialized Court', description: 'POCSO, NDPS, CBI, Cybercrime special courts' },
        { id: 'TALUKA_COURT', agency_branch: 'JUDICIARY', name: 'Subdivisional & Taluka Court', description: 'JMFC & Civil Courts' },
        { id: 'EXECUTIVE_MAGISTRACY', agency_branch: 'JUDICIARY', name: 'Executive Magistracy', description: 'DM, SDM, Mamlatdar Courts' },
    ];
    for (const t of orgTypes) {
        await (0, db_1.query)(`
      INSERT INTO organization_types (id, agency_branch, name, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
    `, [t.id, t.agency_branch, t.name, t.description]);
    }
    console.log('Seeding generic organization node types...');
    const genericNodeTypes = [
        { id: 'BODY', code: 'BODY', name: 'Sovereign Institutional Body', description: 'Apex independent body', body_id: null },
        { id: 'HEADQUARTER', code: 'HEADQUARTER', name: 'State Directorate / Headquarters', description: 'Apex directorate and command headquarters', body_id: null },
        { id: 'WING', code: 'WING', name: 'Specialized Wing', description: 'State specialized wing or cell', body_id: null },
        { id: 'COMMISSIONERATE', code: 'COMMISSIONERATE', name: 'Police Commissionerate', description: 'Metropolitan police city command', body_id: 'POLICE' },
        { id: 'RANGE', code: 'RANGE', name: 'District Police Range', description: 'Multi-district police range', body_id: 'POLICE' },
        { id: 'DISTRICT', code: 'DISTRICT', name: 'District Police / Establishment', description: 'District SP Office / Court establishment', body_id: null },
        { id: 'BRANCH', code: 'BRANCH', name: 'Specialized Branch', description: 'Crime, Traffic, Cyber branches', body_id: 'POLICE' },
        { id: 'SECTOR', code: 'SECTOR', name: 'Sector Command', description: 'Zonal supervisory sector', body_id: 'POLICE' },
        { id: 'ZONE', code: 'ZONE', name: 'Police Zone', description: 'DCP Zonal command jurisdiction', body_id: 'POLICE' },
        { id: 'DIVISION', code: 'DIVISION', name: 'Police Division', description: 'ACP / Subdivisional division', body_id: 'POLICE' },
        { id: 'POLICE_STATION', code: 'POLICE_STATION', name: 'Police Station', description: 'Primary law enforcement and investigation station', body_id: 'POLICE' },
        { id: 'CHOKI', code: 'CHOKI', name: 'Police Choki / Outpost', description: 'Subordinate field outpost', body_id: 'POLICE' },
        { id: 'BEAT', code: 'BEAT', name: 'Patrolling Beat', description: 'Ground beat patrolling sector', body_id: 'POLICE' },
        { id: 'SPECIALIZED_UNIT', code: 'SPECIALIZED_UNIT', name: 'Specialized Battalion', description: 'SRPF, GRP, Marine Police', body_id: 'POLICE' },
        { id: 'UNIT', code: 'UNIT', name: 'Specialized Operational Unit', description: 'Dedicated battalion, squad or lab unit', body_id: null },
        { id: 'COURT', code: 'COURT', name: 'Judicial Court Room', description: 'Principal, Sessions, or Special Court room', body_id: 'JUDICIARY' },
        { id: 'TRIBUNAL', code: 'TRIBUNAL', name: 'State Tribunal / Commission', description: 'Specialized adjudication commission', body_id: 'JUDICIARY' },
        { id: 'STATE_APEX_JUDICIARY', code: 'STATE_APEX_JUDICIARY', name: 'State Apex Judiciary', description: 'High Court of Gujarat', body_id: 'JUDICIARY' },
        { id: 'DISTRICT_COURT_ESTABLISHMENT', code: 'DISTRICT_COURT_ESTABLISHMENT', name: 'District Court Establishment', description: 'Principal District & Sessions Court', body_id: 'JUDICIARY' },
        { id: 'SPECIALIZED_COURT', code: 'SPECIALIZED_COURT', name: 'Specialized Court', description: 'POCSO, NDPS, CBI, Cybercrime special courts', body_id: 'JUDICIARY' },
        { id: 'TALUKA_COURT', code: 'TALUKA_COURT', name: 'Subdivisional & Taluka Court', description: 'JMFC & Civil Courts', body_id: 'JUDICIARY' },
        { id: 'EXECUTIVE_MAGISTRACY', code: 'EXECUTIVE_MAGISTRACY', name: 'Executive Magistracy', description: 'DM, SDM, Mamlatdar Courts', body_id: 'JUDICIARY' },
        { id: 'CENTRAL_DFSS', code: 'CENTRAL_DFSS', name: 'Central DFSS / MHA', description: 'Directorate of Forensic Science Services', body_id: 'FORENSICS' },
        { id: 'CFSL', code: 'CFSL', name: 'Central Forensic Science Laboratory', description: 'CFSL establishments', body_id: 'FORENSICS' },
        { id: 'STATE_FSL_HQ', code: 'STATE_FSL_HQ', name: 'State FSL Directorate HQ', description: 'Gujarat SFSL Gandhinagar', body_id: 'FORENSICS' },
        { id: 'SCIENTIFIC_DIVISION', code: 'SCIENTIFIC_DIVISION', name: 'Scientific Division', description: 'Ballistics, DNA, Cyber, Chemistry, etc.', body_id: 'FORENSICS' },
        { id: 'REGIONAL_FSL', code: 'REGIONAL_FSL', name: 'Regional Forensic Science Lab', description: 'RFSL Zonal Lab', body_id: 'FORENSICS' },
        { id: 'MOBILE_FSL', code: 'MOBILE_FSL', name: 'District Forensic Mobile Unit', description: 'Scene-of-crime rapid response unit', body_id: 'FORENSICS' },
        { id: 'ACADEMIC_INSTITUTE', code: 'ACADEMIC_INSTITUTE', name: 'Forensic University / Training', description: 'NFSU and campuses', body_id: 'FORENSICS' },
        { id: 'LABORATORY', code: 'LABORATORY', name: 'Forensic Science Laboratory', description: 'Central, state, or regional FSL', body_id: 'FORENSICS' },
        { id: 'FSL', code: 'FSL', name: 'Forensic Examination Branch', description: 'Dedicated forensic examination branch', body_id: 'FORENSICS' },
        { id: 'REGIONAL_UNIT', code: 'REGIONAL_UNIT', name: 'Regional Zonal Laboratory', description: 'Regional FSL unit', body_id: 'FORENSICS' },
        { id: 'TRAINING_NODE', code: 'TRAINING_NODE', name: 'Academic & Training Institute', description: 'NFSU or Police Academy', body_id: null },
        { id: 'MASTER_APEX', code: 'MASTER_APEX', name: 'Master Apex Level', description: 'Cross-Agency Root Administration', body_id: 'MASTER' }
    ];
    for (const nt of genericNodeTypes) {
        await (0, db_1.query)(`
      INSERT INTO organization_node_types (id, code, name, description, body_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, description = EXCLUDED.description, body_id = EXCLUDED.body_id;
    `, [nt.id, nt.code, nt.name, nt.description, nt.body_id]);
    }
    // Clear existing nodes to avoid stale merged hierarchy
    await (0, db_1.query)(`DELETE FROM organization_nodes;`);
    console.log('Seeding the 3 independent sovereign trees + master apex...');
    // =========================================================================
    // TREE 0: MASTER APEX GOVERNANCE (body_id: 'MASTER')
    // =========================================================================
    const masterRes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      'MASTER', 'MASTER', 'MASTER_APEX', 'Gujarat State Justice Command (Master Apex)',
      'GUJ-MASTER-ROOT', 'MASTER.APEX', 1, 'State of Gujarat Apex Governance'
    ) RETURNING id;
  `);
    const masterId = masterRes.rows[0].id;
    // =========================================================================
    // TREE 1: GUJARAT POLICE HIERARCHY (body_id: 'POLICE')
    // Sovereign Root Node (parent_id: null)
    // =========================================================================
    const policeHqRes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      'POLICE', 'POLICE', 'STATE_HQ', 'Gujarat Police State Head Quarter',
      'GUJ-POL-STATE-HQ', 'POLICE.HQ', 1, 'Statewide Sovereign Police Command'
    ) RETURNING id;
  `);
    const policeHqId = policeHqRes.rows[0].id;
    // Executive Leadership
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'STATE_HQ', 'Director General of Police & Executive Leadership',
      'GUJ-POL-EXEC-LEAD', 'POLICE.HQ.EXEC', 2, 'Executive Leadership & Command Staff'
    );
  `, [policeHqId]);
    // 13 Specialized Police Wings
    const policeWings = [
        { code: 'GUJ-POL-ATS', name: 'Anti-Terrorism Squad (ATS)', slug: 'ATS' },
        { code: 'GUJ-POL-CID-CRIME', name: 'CID Crime and Railways', slug: 'CID_CRIME' },
        { code: 'GUJ-POL-STATE-IB', name: 'Gujarat Intelligence Force (State IB)', slug: 'STATE_IB' },
        { code: 'GUJ-POL-SAF', name: 'Special Action Force (SAF)', slug: 'SAF' },
        { code: 'GUJ-POL-SOG', name: 'Special Operations Group (SOG)', slug: 'SOG' },
        { code: 'GUJ-POL-CYBERCRIME', name: 'Cybercrime Wing & State Cyber Cell', slug: 'CYBERCRIME' },
        { code: 'GUJ-POL-EOW', name: 'Economic Offences Wing (EOW)', slug: 'EOW' },
        { code: 'GUJ-POL-PROTECTION', name: 'Protection & Security Wing', slug: 'PROTECTION' },
        { code: 'GUJ-POL-COASTAL', name: 'Coastal Security Wing', slug: 'COASTAL' },
        { code: 'GUJ-POL-SCRB', name: 'State Crime Record Bureau (SCRB)', slug: 'SCRB' },
        { code: 'GUJ-POL-TRAINING', name: 'Police Training Wing & Academies', slug: 'TRAINING' },
        { code: 'GUJ-POL-TECH-SERVICES', name: 'Technical Services & Telecommunications', slug: 'TECH_SERVICES' },
        { code: 'GUJ-POL-LEGAL', name: 'Legal Cell & Prosecution Support', slug: 'LEGAL' },
    ];
    for (const w of policeWings) {
        await (0, db_1.query)(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
      ) VALUES (
        $1, 'POLICE', 'POLICE', 'POLICE_WING', $2, $3, $4, 2, 'Statewide Specialized Jurisdiction'
      );
    `, [policeHqId, w.name, w.code, `POLICE.HQ.${w.slug}`]);
    }
    // 4 Metropolitan Police Commissionerates
    // 1. Ahmedabad Commissionerate
    const amdCommRes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'COMMISSIONERATE', 'Ahmedabad City Police Commissionerate',
      'GUJ-POL-COMM-AHMEDABAD', 'POLICE.HQ.COMM_AHMEDABAD', 2, 'Ahmedabad Metropolitan Area'
    ) RETURNING id;
  `, [policeHqId]);
    const amdCommId = amdCommRes.rows[0].id;
    // Ahmedabad Subtree
    const amdSec1 = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'SECTOR', 'Ahmedabad Sector 1',
      'GUJ-POL-AMD-SEC1', 'POLICE.HQ.COMM_AHMEDABAD.SEC1', 3, 'Ahmedabad West'
    ) RETURNING id;
  `, [amdCommId]);
    const amdZone1 = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'ZONE', 'Ahmedabad Zone 1 (DCP Office)',
      'GUJ-POL-AMD-Z1', 'POLICE.HQ.COMM_AHMEDABAD.SEC1.Z1', 4, 'Zone 1 Jurisdiction'
    ) RETURNING id;
  `, [amdSec1.rows[0].id]);
    const amdDivA = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'DIVISION', 'Ahmedabad Division A (ACP Office)',
      'GUJ-POL-AMD-DIVA', 'POLICE.HQ.COMM_AHMEDABAD.SEC1.Z1.DIVA', 5, 'Navrangpura Division'
    ) RETURNING id;
  `, [amdZone1.rows[0].id]);
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'POLICE_STATION', 'Navrangpura Police Station',
      'GUJ-POL-AMD-STA', 'POLICE.HQ.COMM_AHMEDABAD.SEC1.Z1.DIVA.STA', 6, 'Navrangpura Area'
    );
  `, [amdDivA.rows[0].id]);
    // Sibling Police Station under Division A
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'POLICE_STATION', 'Ellisbridge Police Station',
      'GUJ-POL-AMD-STB', 'POLICE.HQ.COMM_AHMEDABAD.SEC1.Z1.DIVA.STB', 6, 'Ellisbridge Area'
    );
  `, [amdDivA.rows[0].id]);
    // 2. Surat Commissionerate
    const suratCommRes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'COMMISSIONERATE', 'Surat City Police Commissionerate',
      'GUJ-POL-COMM-SURAT', 'POLICE.HQ.COMM_SURAT', 2, 'Surat Metropolitan Area'
    ) RETURNING id;
  `, [policeHqId]);
    const suratCommId = suratCommRes.rows[0].id;
    // Surat Crime Branch
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'BRANCH', 'Surat Crime Branch',
      'GUJ-POL-SURAT-CRIME', 'POLICE.HQ.COMM_SURAT.CRIME', 3, 'Surat City Special Crime'
    );
  `, [suratCommId]);
    // Surat Sector 1 -> Zone 1 -> Division A -> Station A & Station B
    const suratSec1 = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'SECTOR', 'Surat Sector 1',
      'GUJ-POL-SURAT-SEC1', 'POLICE.HQ.COMM_SURAT.SEC1', 3, 'Surat South & Central'
    ) RETURNING id;
  `, [suratCommId]);
    const suratZone1 = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'ZONE', 'Surat Zone 1 (DCP Office)',
      'GUJ-POL-SURAT-Z1', 'POLICE.HQ.COMM_SURAT.SEC1.Z1', 4, 'Zone 1 Jurisdiction'
    ) RETURNING id;
  `, [suratSec1.rows[0].id]);
    const suratDivA = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'DIVISION', 'Surat Division A (ACP Office)',
      'GUJ-POL-SURAT-DIVA', 'POLICE.HQ.COMM_SURAT.SEC1.Z1.DIVA', 5, 'Division A'
    ) RETURNING id;
  `, [suratZone1.rows[0].id]);
    // Station A
    const stationARes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'POLICE_STATION', 'Surat Central Police Station A',
      'GUJ-POL-SURAT-STA', 'POLICE.HQ.COMM_SURAT.SEC1.Z1.DIVA.STA', 6, 'Central Commercial & Ring Road'
    ) RETURNING id;
  `, [suratDivA.rows[0].id]);
    const stationAId = stationARes.rows[0].id;
    // Chowki 1 & Beat 1 under Station A
    const chowki1Res = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'CHOKI', 'Ring Road Police Chowki 1',
      'GUJ-POL-SURAT-CHK1', 'POLICE.HQ.COMM_SURAT.SEC1.Z1.DIVA.STA.CHK1', 7, 'Ring Road Commercial'
    ) RETURNING id;
  `, [stationAId]);
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'BEAT', 'Patrol Beat 1 (Diamond Market)',
      'GUJ-POL-SURAT-BEAT1', 'POLICE.HQ.COMM_SURAT.SEC1.Z1.DIVA.STA.CHK1.BEAT1', 8, 'Diamond Market Patrolling'
    );
  `, [chowki1Res.rows[0].id]);
    // Sibling Station B under Division A (for Sibling Isolation Testing)
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'POLICE_STATION', 'Surat Varachha Police Station B',
      'GUJ-POL-SURAT-STB', 'POLICE.HQ.COMM_SURAT.SEC1.Z1.DIVA.STB', 6, 'Varachha Sector'
    );
  `, [suratDivA.rows[0].id]);
    // 3. Vadodara Commissionerate
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'COMMISSIONERATE', 'Vadodara City Police Commissionerate',
      'GUJ-POL-COMM-VADODARA', 'POLICE.HQ.COMM_VADODARA', 2, 'Vadodara Metropolitan Area'
    );
  `, [policeHqId]);
    // 4. Rajkot Commissionerate
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'POLICE', 'POLICE', 'COMMISSIONERATE', 'Rajkot City Police Commissionerate',
      'GUJ-POL-COMM-RAJKOT', 'POLICE.HQ.COMM_RAJKOT', 2, 'Rajkot Metropolitan Area'
    );
  `, [policeHqId]);
    // 8 District Ranges
    const districtRanges = [
        { code: 'GUJ-POL-RANGE-GANDHINAGAR', name: 'Gandhinagar Police Range', slug: 'RANGE_GANDHINAGAR' },
        { code: 'GUJ-POL-RANGE-BORDER', name: 'Border Police Range (Kutch/Banaskantha)', slug: 'RANGE_BORDER' },
        { code: 'GUJ-POL-RANGE-VADODARA', name: 'Vadodara District Police Range', slug: 'RANGE_VADODARA' },
        { code: 'GUJ-POL-RANGE-RAJKOT', name: 'Rajkot District Police Range', slug: 'RANGE_RAJKOT' },
        { code: 'GUJ-POL-RANGE-SURAT', name: 'Surat District Police Range', slug: 'RANGE_SURAT' },
        { code: 'GUJ-POL-RANGE-BHAVNAGAR', name: 'Bhavnagar Police Range', slug: 'RANGE_BHAVNAGAR' },
        { code: 'GUJ-POL-RANGE-JUNAGADH', name: 'Junagadh Police Range', slug: 'RANGE_JUNAGADH' },
        { code: 'GUJ-POL-RANGE-PANCHMAHAL', name: 'Panchmahal Police Range', slug: 'RANGE_PANCHMAHAL' },
    ];
    for (const r of districtRanges) {
        await (0, db_1.query)(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
      ) VALUES (
        $1, 'POLICE', 'POLICE', 'DISTRICT_RANGE', $2, $3, $4, 2, 'Regional District Cluster'
      );
    `, [policeHqId, r.name, r.code, `POLICE.HQ.${r.slug}`]);
    }
    // Specialized State Units
    const specializedUnits = [
        { code: 'GUJ-POL-SRPF', name: 'State Reserve Police Force (SRPF Groups)', slug: 'SRPF' },
        { code: 'GUJ-POL-GRP', name: 'Government Railway Police (GRP)', slug: 'GRP' },
        { code: 'GUJ-POL-MARINE', name: 'Marine Police Units & Coastal Stations', slug: 'MARINE' },
        { code: 'GUJ-POL-SHARED', name: 'Shared Police Services & Forensic Liaison', slug: 'SHARED' },
    ];
    for (const u of specializedUnits) {
        await (0, db_1.query)(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
      ) VALUES (
        $1, 'POLICE', 'POLICE', 'SPECIALIZED_UNIT', $2, $3, $4, 2, 'Statewide Strategic Deployment'
      );
    `, [policeHqId, u.name, u.code, `POLICE.HQ.${u.slug}`]);
    }
    // =========================================================================
    // TREE 2: GUJARAT STATE JUDICIARY HIERARCHY (body_id: 'JUDICIARY')
    // Sovereign Root Node (parent_id: null)
    // =========================================================================
    const judApexRes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      'JUDICIARY', 'JUDICIARY', 'STATE_APEX_JUDICIARY', 'Gujarat State Judiciary (Apex)',
      'GUJ-JUD-APEX', 'JUDICIARY.APEX', 1, 'Statewide Sovereign Judicial Administration'
    ) RETURNING id;
  `);
    const judApexId = judApexRes.rows[0].id;
    // High Court of Gujarat
    const hcRes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'JUDICIARY', 'JUDICIARY', 'STATE_APEX_JUDICIARY', 'High Court of Gujarat',
      'GUJ-HC-APEX', 'JUDICIARY.APEX.HC', 2, 'Constitutional & Appellate Apex Court'
    ) RETURNING id;
  `, [judApexId]);
    const hcId = hcRes.rows[0].id;
    // High Court Wings
    const hcWings = [
        { code: 'GUJ-HC-REGISTRAR', name: 'Registrar General & Judicial Administrative Wing', slug: 'REGISTRAR' },
        { code: 'GUJ-HC-ECOURTS', name: 'IT & eCourts Administrative Wing', slug: 'ECOURTS' },
        { code: 'GUJ-HC-PROTOCOL', name: 'Judicial Officers Protocol & Recruitment Branch', slug: 'PROTOCOL' },
        { code: 'GUJ-HC-BENCHES', name: 'High Court Benches (Division & Single Benches)', slug: 'BENCHES' },
    ];
    for (const hw of hcWings) {
        await (0, db_1.query)(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
      ) VALUES (
        $1, 'JUDICIARY', 'JUDICIARY', 'STATE_APEX_JUDICIARY', $2, $3, $4, 3, 'High Court Governance'
      );
    `, [hcId, hw.name, hw.code, `JUDICIARY.APEX.HC.${hw.slug}`]);
    }
    // District Judiciary Establishments
    const districtCourts = [
        { code: 'GUJ-JUD-DIST-AHMEDABAD', name: 'Principal District & Sessions Court, Ahmedabad', slug: 'DIST_AHMEDABAD' },
        { code: 'GUJ-JUD-DIST-SURAT', name: 'Principal District & Sessions Court Establishment, Surat', slug: 'DIST_SURAT' },
        { code: 'GUJ-JUD-DIST-VADODARA', name: 'Principal District & Sessions Court, Vadodara', slug: 'DIST_VADODARA' },
        { code: 'GUJ-JUD-DIST-RAJKOT', name: 'Principal District & Sessions Court, Rajkot', slug: 'DIST_RAJKOT' },
    ];
    let suratDistCourtId = '';
    for (const dc of districtCourts) {
        const res = await (0, db_1.query)(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
      ) VALUES (
        $1, 'JUDICIARY', 'JUDICIARY', 'DISTRICT_COURT_ESTABLISHMENT', $2, $3, $4, 2, 'District Judicial Jurisdiction'
      ) RETURNING id;
    `, [judApexId, dc.name, dc.code, `JUDICIARY.APEX.${dc.slug}`]);
        if (dc.code === 'GUJ-JUD-DIST-SURAT') {
            suratDistCourtId = res.rows[0].id;
        }
    }
    // Surat District Court Subtree (Sessions Court Room 4, CJM, JMFC)
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'JUDICIARY', 'JUDICIARY', 'DISTRICT_COURT_ESTABLISHMENT', 'Additional Sessions Court Room No. 4, Surat',
      'GUJ-JUD-SURAT-SESS4', 'JUDICIARY.APEX.DIST_SURAT.SESS4', 3, 'Serious Criminal Trials & BNS Trials'
    );
  `, [suratDistCourtId]);
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'JUDICIARY', 'JUDICIARY', 'TALUKA_COURT', 'Chief Judicial Magistrate (CJM) Court, Surat',
      'GUJ-JUD-SURAT-CJM', 'JUDICIARY.APEX.DIST_SURAT.CJM', 3, 'Magisterial Cognizance & Remand'
    );
  `, [suratDistCourtId]);
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'JUDICIARY', 'JUDICIARY', 'TALUKA_COURT', 'Judicial Magistrate First Class (JMFC) Court 1, Surat',
      'GUJ-JUD-SURAT-JMFC1', 'JUDICIARY.APEX.DIST_SURAT.JMFC1', 3, 'Summary & Magisterial Trials'
    );
  `, [suratDistCourtId]);
    // Specialized Courts
    const specializedCourts = [
        { code: 'GUJ-JUD-SPEC-CBI', name: 'Special CBI Courts, Ahmedabad', slug: 'SPEC_CBI' },
        { code: 'GUJ-JUD-SPEC-ACB', name: 'Special Anti-Corruption Bureau (ACB) Courts', slug: 'SPEC_ACB' },
        { code: 'GUJ-JUD-SPEC-COMMERCIAL', name: 'Commercial Courts & Commercial Appellate Division', slug: 'SPEC_COMMERCIAL' },
        { code: 'GUJ-JUD-SPEC-POCSO', name: 'Special POCSO Courts (Child Protection)', slug: 'SPEC_POCSO' },
        { code: 'GUJ-JUD-SPEC-NDPS', name: 'Special NDPS Courts (Narcotics)', slug: 'SPEC_NDPS' },
        { code: 'GUJ-JUD-SPEC-MACT', name: 'Motor Accident Claims Tribunals (MACT)', slug: 'SPEC_MACT' },
        { code: 'GUJ-JUD-TALUKA-CJM', name: 'Taluka CJM Courts Cluster', slug: 'TALUKA_CJM', type: 'TALUKA_COURT' },
        { code: 'GUJ-JUD-TALUKA-JMFC', name: 'Sub-Divisional JMFC Courts Cluster', slug: 'TALUKA_JMFC', type: 'TALUKA_COURT' },
        { code: 'GUJ-JUD-MAG-DM', name: 'District Magistrate (DM) / Collectorate Courts', slug: 'MAG_DM', type: 'EXECUTIVE_MAGISTRACY' },
        { code: 'GUJ-JUD-MAG-SDM', name: 'Sub-Divisional Magistrate (SDM) Courts', slug: 'MAG_SDM', type: 'EXECUTIVE_MAGISTRACY' },
        { code: 'GUJ-JUD-SHARED', name: 'Shared Judicial Services & Registry Archive', slug: 'SHARED', type: 'DISTRICT_COURT_ESTABLISHMENT' },
    ];
    for (const sc of specializedCourts) {
        await (0, db_1.query)(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
      ) VALUES (
        $1, 'JUDICIARY', 'JUDICIARY', $2, $3, $4, $5, 2, 'Designated Judicial Specialization'
      );
    `, [judApexId, sc.type || 'SPECIALIZED_COURT', sc.name, sc.code, `JUDICIARY.APEX.${sc.slug}`]);
    }
    // =========================================================================
    // TREE 3: FORENSIC SCIENCE SERVICES HIERARCHY (body_id: 'FORENSICS')
    // Sovereign Root Node (parent_id: null)
    // =========================================================================
    const fslApexRes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      'FORENSICS', 'FORENSICS', 'CENTRAL_DFSS', 'Forensic Science Services (Central DFSS & State Directorate)',
      'GUJ-FSL-APEX', 'FORENSICS.DFSS', 1, 'National & State Forensic Science Authority'
    ) RETURNING id;
  `);
    const fslApexId = fslApexRes.rows[0].id;
    // Central DFSS Node
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'CENTRAL_DFSS', 'Directorate of Forensic Science Services (DFSS Apex)',
      'DFSS-INDIA-HQ', 'FORENSICS.DFSS.CENTRAL', 2, 'National Forensic Scientific Standards'
    );
  `, [fslApexId]);
    // Central Specialized Lab
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'CFSL', 'Central Specialized Forensic Science Unit',
      'CFSL-SPECIALIZED', 'FORENSICS.DFSS.CFSL', 2, 'Central Scientific Forensics'
    );
  `, [fslApexId]);
    // State FSL Gandhinagar HQ
    const sfslHqRes = await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'STATE_FSL_HQ', 'Gujarat State Forensic Science Laboratory (SFSL Gandhinagar HQ)',
      'GUJ-SFSL-HQ', 'FORENSICS.DFSS.SFSL_GUJ', 2, 'Statewide Forensic Examination & Directorate'
    ) RETURNING id;
  `, [fslApexId]);
    const sfslHqId = sfslHqRes.rows[0].id;
    // 8 Scientific Divisions at SFSL Gandhinagar
    const sfslDivisions = [
        { code: 'SFSL-DIV-BALLISTICS', name: 'Ballistics & Physical Sciences Division', slug: 'BALLISTICS' },
        { code: 'SFSL-DIV-DNA', name: 'Biology, Serology & DNA Profiling Division', slug: 'DNA' },
        { code: 'SFSL-DIV-TOXICOLOGY', name: 'Chemistry & Toxicology Division', slug: 'TOXICOLOGY' },
        { code: 'SFSL-DIV-CYBER', name: 'Cyber Forensics & Digital Investigation Division', slug: 'CYBER' },
        { code: 'SFSL-DIV-DOCUMENTS', name: 'Questioned Documents & Handwriting Analysis', slug: 'DOCUMENTS' },
        { code: 'SFSL-DIV-FINGERPRINTS', name: 'Fingerprint Bureau & Biometrics Division', slug: 'FINGERPRINTS' },
        { code: 'SFSL-DIV-PSYCHOLOGY', name: 'Forensic Psychology, Lie Detection & Narco-Analysis', slug: 'PSYCHOLOGY' },
        { code: 'SFSL-DIV-NARCOTICS', name: 'Narcotics, Explosives & Chemical Warfare Division', slug: 'NARCOTICS' },
    ];
    for (const d of sfslDivisions) {
        await (0, db_1.query)(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
      ) VALUES (
        $1, 'FORENSICS', 'FORENSICS', 'SCIENTIFIC_DIVISION', $2, $3, $4, 3, 'Statewide Forensic Specialization'
      );
    `, [sfslHqId, d.name, d.code, `FORENSICS.DFSS.SFSL_GUJ.${d.slug}`]);
    }
    // Regional Forensic Science Laboratories (RFSL)
    const rfslNodes = [
        { code: 'GUJ-RFSL-AHMEDABAD', name: 'Regional FSL Ahmedabad', slug: 'RFSL_AMD' },
        { code: 'GUJ-RFSL-SURAT', name: 'Regional Forensic Science Laboratory (RFSL Surat)', slug: 'RFSL_SURAT' },
        { code: 'GUJ-RFSL-VADODARA', name: 'Regional FSL Vadodara', slug: 'RFSL_BRD' },
        { code: 'GUJ-RFSL-RAJKOT', name: 'Regional FSL Rajkot', slug: 'RFSL_RJK' },
    ];
    let rfslSuratId = '';
    let rfslAmdId = '';
    for (const r of rfslNodes) {
        const res = await (0, db_1.query)(`
      INSERT INTO organization_nodes (
        parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
      ) VALUES (
        $1, 'FORENSICS', 'FORENSICS', 'REGIONAL_FSL', $2, $3, $4, 2, 'Regional Forensic Examination'
      ) RETURNING id;
    `, [fslApexId, r.name, r.code, `FORENSICS.DFSS.${r.slug}`]);
        if (r.code === 'GUJ-RFSL-SURAT')
            rfslSuratId = res.rows[0].id;
        if (r.code === 'GUJ-RFSL-AHMEDABAD')
            rfslAmdId = res.rows[0].id;
    }
    // Specialized Units under RFSL Surat
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'SCIENTIFIC_DIVISION', 'RFSL Surat Ballistics Unit',
      'RFSL-SURAT-BALLISTICS', 'FORENSICS.DFSS.RFSL_SURAT.BALLISTICS', 3, 'Surat Regional Ballistics'
    );
  `, [rfslSuratId]);
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'SCIENTIFIC_DIVISION', 'RFSL Surat Chemistry & Toxicology Unit',
      'RFSL-SURAT-CHEMISTRY', 'FORENSICS.DFSS.RFSL_SURAT.CHEMISTRY', 3, 'Surat Regional Toxicology'
    );
  `, [rfslSuratId]);
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'SCIENTIFIC_DIVISION', 'RFSL Surat Cyber Forensics Unit',
      'RFSL-SURAT-CYBER', 'FORENSICS.DFSS.RFSL_SURAT.CYBER', 3, 'Surat Regional Cyber Lab'
    );
  `, [rfslSuratId]);
    // District Mobile Forensic Units
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'MOBILE_FSL', 'District Mobile Forensic Unit (DFSU Surat Mobile Van)',
      'GUJ-MFSL-SURAT', 'FORENSICS.DFSS.RFSL_SURAT.MFSL', 3, 'Surat Rapid Scene Response'
    );
  `, [rfslSuratId]);
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'MOBILE_FSL', 'District Mobile Forensic Unit (DFSU Ahmedabad Mobile Van)',
      'GUJ-MFSL-AHMEDABAD', 'FORENSICS.DFSS.RFSL_AMD.MFSL', 3, 'Ahmedabad Rapid Scene Response'
    );
  `, [rfslAmdId]);
    // NFSU Academic Node
    await (0, db_1.query)(`
    INSERT INTO organization_nodes (
      parent_id, body_id, agency_branch, type_id, name, code, hierarchy_path, level, jurisdiction_area
    ) VALUES (
      $1, 'FORENSICS', 'FORENSICS', 'ACADEMIC_INSTITUTE', 'National Forensic Sciences University (NFSU Gandhinagar)',
      'NFSU-HQ', 'FORENSICS.DFSS.NFSU', 2, 'Forensic Academia, Research & Training'
    );
  `, [fslApexId]);
    // =========================================================================
    // 3. System Permissions
    // =========================================================================
    console.log('Seeding system permissions...');
    const permissionsList = [
        // Case & FIR
        { id: 'CASE_CREATE', category: 'CASE', description: 'Initiate new or legacy FIR case workspace' },
        { id: 'CASE_READ', category: 'CASE', description: 'View authorized case workspaces' },
        { id: 'CASE_UPDATE', category: 'CASE', description: 'Modify case details and status' },
        { id: 'CASE_ASSIGN', category: 'CASE', description: 'Assign lead investigator or case diarist' },
        { id: 'CASE_CLOSE', category: 'CASE', description: 'Close or dispose case files' },
        { id: 'FIR_CREATE', category: 'FIR', description: 'Register official First Information Report' },
        { id: 'FIR_READ', category: 'FIR', description: 'Inspect FIR details and acts/sections' },
        { id: 'FIR_UPDATE', category: 'FIR', description: 'Update supplementary FIR details' },
        // Investigation & Panchnama
        { id: 'INVESTIGATION_CREATE', category: 'INVESTIGATION', description: 'Record case diary entries and statements' },
        { id: 'INVESTIGATION_READ', category: 'INVESTIGATION', description: 'Read investigative entries and panchnamas' },
        { id: 'INVESTIGATION_UPDATE', category: 'INVESTIGATION', description: 'Update diary entries and prepare chargesheet' },
        // Physical & Digital Evidence
        { id: 'EVIDENCE_CREATE', category: 'EVIDENCE', description: 'Register physical and digital evidence items' },
        { id: 'EVIDENCE_READ', category: 'EVIDENCE', description: 'Inspect evidence catalog and tags' },
        { id: 'EVIDENCE_TRANSFER', category: 'EVIDENCE', description: 'Execute chain-of-custody transfer events' },
        { id: 'EVIDENCE_RETURN', category: 'EVIDENCE', description: 'Return evidence to owner or dispose' },
        // Forensics
        { id: 'FORENSIC_CREATE', category: 'FORENSIC', description: 'Submit forensic requisition memo to lab' },
        { id: 'FORENSIC_EXAMINE', category: 'FORENSIC', description: 'Conduct laboratory forensic examinations' },
        { id: 'FORENSIC_REPORT', category: 'FORENSIC', description: 'Issue and seal formal forensic examination reports' },
        // Court & Adjudication
        { id: 'COURT_CREATE', category: 'COURT', description: 'Register court case and assign CNR number' },
        { id: 'COURT_READ', category: 'COURT', description: 'Inspect court docket and case listings' },
        { id: 'COURT_HEARING_RECORD', category: 'COURT', description: 'Record hearing daily orders and next dates' },
        { id: 'COURT_ORDER_ISSUE', category: 'COURT', description: 'Issue bail, summons, warrant, and orders' },
        { id: 'COURT_JUDGEMENT', category: 'COURT', description: 'Pronounce final judgement and sentencing' },
        // Documents Vault
        { id: 'DOCUMENT_UPLOAD', category: 'DOCUMENT', description: 'Upload verified documents to secure vault' },
        { id: 'DOCUMENT_READ', category: 'DOCUMENT', description: 'Inspect document metadata' },
        { id: 'DOCUMENT_DOWNLOAD', category: 'DOCUMENT', description: 'Stream and download verified vault documents' },
        // User & Organization Administration
        { id: 'USER_CREATE', category: 'ADMIN', description: 'Provision new system users within subtree' },
        { id: 'USER_READ', category: 'ADMIN', description: 'List and view user profiles within subtree' },
        { id: 'USER_UPDATE', category: 'ADMIN', description: 'Update user profiles, roles, and locks' },
        { id: 'USER_DEACTIVATE', category: 'ADMIN', description: 'Deactivate or lock user accounts' },
        { id: 'ORG_CREATE', category: 'ADMIN', description: 'Create subordinate organization nodes' },
        { id: 'ORG_READ', category: 'ADMIN', description: 'View organization hierarchy nodes' },
        { id: 'ORG_UPDATE', category: 'ADMIN', description: 'Modify organization metadata' },
        // Security, Delegation & Audit
        { id: 'DELEGATION_MANAGE', category: 'SECURITY', description: 'Issue and revoke temporary delegated access' },
        { id: 'AUDIT_READ', category: 'SECURITY', description: 'Inspect immutable system and case audit logs' },
    ];
    for (const p of permissionsList) {
        await (0, db_1.query)(`
      INSERT INTO permissions (id, category, description)
      VALUES ($1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, description = EXCLUDED.description;
    `, [p.id, p.category, p.description]);
    }
    // =========================================================================
    // 4. Institutional Roles
    // =========================================================================
    console.log('Seeding institutional roles...');
    const rolesList = [
        {
            id: 'SYSTEM_MASTER_ADMIN',
            agency_branch: 'MASTER',
            name: 'System Master Administrator',
            description: 'Apex cross-agency governance, sovereign body provisioning, and root administration',
            is_system: true,
            permissions: permissionsList.map(p => p.id),
        },
        {
            id: 'MASTER_ADMIN',
            agency_branch: 'MASTER',
            name: 'Master System Administrator',
            description: 'Apex cross-agency governance, sovereign body provisioning, and root administration',
            is_system: true,
            permissions: permissionsList.map(p => p.id),
        },
        {
            id: 'BODY_ADMIN',
            agency_branch: 'ALL',
            name: 'Sovereign Body Administrator',
            description: 'Supreme command authority across an entire sovereign agency tree (Police, Judiciary, or Forensics)',
            is_system: true,
            permissions: [
                'CASE_CREATE', 'CASE_READ', 'CASE_UPDATE', 'CASE_ASSIGN', 'CASE_CLOSE',
                'FIR_CREATE', 'FIR_READ', 'FIR_UPDATE',
                'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_UPDATE',
                'EVIDENCE_CREATE', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER', 'EVIDENCE_RETURN',
                'FORENSIC_CREATE', 'FORENSIC_EXAMINE', 'FORENSIC_REPORT',
                'COURT_CREATE', 'COURT_READ', 'COURT_HEARING_RECORD', 'COURT_ORDER_ISSUE', 'COURT_JUDGEMENT',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
                'ORG_CREATE', 'ORG_READ', 'ORG_UPDATE',
                'DELEGATION_MANAGE', 'AUDIT_READ'
            ],
        },
        {
            id: 'POLICE_BODY_ADMIN',
            agency_branch: 'POLICE',
            name: 'Police Sovereign Body Administrator',
            description: 'State DGP / Apex Leadership administrative authority over all police units and stations',
            is_system: true,
            permissions: [
                'CASE_CREATE', 'CASE_READ', 'CASE_UPDATE', 'CASE_ASSIGN', 'CASE_CLOSE',
                'FIR_CREATE', 'FIR_READ', 'FIR_UPDATE',
                'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_UPDATE',
                'EVIDENCE_CREATE', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER', 'EVIDENCE_RETURN',
                'FORENSIC_CREATE', 'COURT_READ',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
                'ORG_CREATE', 'ORG_READ', 'ORG_UPDATE',
                'DELEGATION_MANAGE', 'AUDIT_READ'
            ],
        },
        {
            id: 'POLICE_ADMIN',
            agency_branch: 'POLICE',
            name: 'Police Command Administrator',
            description: 'Administrative authority over subordinate police units, stations, and personnel',
            is_system: true,
            permissions: [
                'CASE_CREATE', 'CASE_READ', 'CASE_UPDATE', 'CASE_ASSIGN', 'CASE_CLOSE',
                'FIR_CREATE', 'FIR_READ', 'FIR_UPDATE',
                'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_UPDATE',
                'EVIDENCE_CREATE', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER', 'EVIDENCE_RETURN',
                'FORENSIC_CREATE', 'COURT_READ',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
                'ORG_CREATE', 'ORG_READ', 'ORG_UPDATE',
                'DELEGATION_MANAGE', 'AUDIT_READ'
            ],
        },
        {
            id: 'NODE_ADMIN',
            agency_branch: 'ALL',
            name: 'Node Administrator',
            description: 'Reusable administrative authority over an assigned organizational node and its subordinate subtree',
            is_system: true,
            permissions: [
                'CASE_CREATE', 'CASE_READ', 'CASE_UPDATE', 'CASE_ASSIGN', 'CASE_CLOSE',
                'FIR_CREATE', 'FIR_READ', 'FIR_UPDATE',
                'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_UPDATE',
                'EVIDENCE_CREATE', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER', 'EVIDENCE_RETURN',
                'FORENSIC_CREATE', 'FORENSIC_EXAMINE', 'FORENSIC_REPORT',
                'COURT_CREATE', 'COURT_READ', 'COURT_HEARING_RECORD', 'COURT_ORDER_ISSUE',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
                'ORG_CREATE', 'ORG_READ', 'ORG_UPDATE',
                'DELEGATION_MANAGE', 'AUDIT_READ'
            ],
        },
        {
            id: 'POLICE_OFFICER',
            agency_branch: 'POLICE',
            name: 'Police Officer / Station Staff',
            description: 'Operational police station officer with routine duty and read/entry permissions',
            is_system: true,
            permissions: [
                'CASE_READ', 'FIR_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD'
            ],
        },
        {
            id: 'INVESTIGATING_OFFICER',
            agency_branch: 'POLICE',
            name: 'Police Investigating Officer (IO)',
            description: 'Field officer handling FIR registration, case diaries, panchnama, evidence, and chargesheets',
            is_system: true,
            permissions: [
                'CASE_CREATE', 'CASE_READ', 'CASE_UPDATE',
                'FIR_CREATE', 'FIR_READ', 'FIR_UPDATE',
                'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_UPDATE',
                'EVIDENCE_CREATE', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER',
                'FORENSIC_CREATE', 'COURT_READ',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'DELEGATION_MANAGE'
            ],
        },
        {
            id: 'INVESTIGATOR',
            agency_branch: 'POLICE',
            name: 'Police Investigating Officer (IO)',
            description: 'Field officer handling FIR registration, case diaries, panchnama, evidence, and chargesheets',
            is_system: true,
            permissions: [
                'CASE_CREATE', 'CASE_READ', 'CASE_UPDATE',
                'FIR_CREATE', 'FIR_READ', 'FIR_UPDATE',
                'INVESTIGATION_CREATE', 'INVESTIGATION_READ', 'INVESTIGATION_UPDATE',
                'EVIDENCE_CREATE', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER',
                'FORENSIC_CREATE', 'COURT_READ',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'DELEGATION_MANAGE'
            ],
        },
        {
            id: 'COURT_ADMIN',
            agency_branch: 'JUDICIARY',
            name: 'Judicial Registrar / Court Administrator',
            description: 'Court registry administrator managing case listings, summons, and records',
            is_system: true,
            permissions: [
                'CASE_READ', 'FIR_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ',
                'COURT_CREATE', 'COURT_READ', 'COURT_HEARING_RECORD', 'COURT_ORDER_ISSUE',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
                'ORG_READ', 'AUDIT_READ'
            ],
        },
        {
            id: 'COURT_USER',
            agency_branch: 'JUDICIARY',
            name: 'Court Staff & Judicial Officer',
            description: 'Court clerk, steno, and judicial staff handling docket entries and proceedings',
            is_system: true,
            permissions: [
                'CASE_READ', 'FIR_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ',
                'COURT_READ', 'COURT_HEARING_RECORD',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD'
            ],
        },
        {
            id: 'JUDGE',
            agency_branch: 'JUDICIARY',
            name: 'Presiding Judge / Magistrate',
            description: 'Judicial officer presiding over trials, orders, bail hearings, and judgements',
            is_system: true,
            permissions: [
                'CASE_READ', 'FIR_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ',
                'COURT_CREATE', 'COURT_READ', 'COURT_HEARING_RECORD', 'COURT_ORDER_ISSUE', 'COURT_JUDGEMENT',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD'
            ],
        },
        {
            id: 'FSL_ADMIN',
            agency_branch: 'FORENSICS',
            name: 'Forensic Laboratory Director',
            description: 'Administrative head of forensic directorates and regional laboratory branches',
            is_system: true,
            permissions: [
                'CASE_READ', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER',
                'FORENSIC_EXAMINE', 'FORENSIC_REPORT',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
                'ORG_READ', 'AUDIT_READ'
            ],
        },
        {
            id: 'FORENSIC_ADMIN',
            agency_branch: 'FORENSICS',
            name: 'Forensic Laboratory Director',
            description: 'Administrative head of forensic directorates and regional laboratory branches',
            is_system: true,
            permissions: [
                'CASE_READ', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER',
                'FORENSIC_EXAMINE', 'FORENSIC_REPORT',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD',
                'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DEACTIVATE',
                'ORG_READ', 'AUDIT_READ'
            ],
        },
        {
            id: 'FSL_EXAMINER',
            agency_branch: 'FORENSICS',
            name: 'Forensic Scientific Examiner',
            description: 'Laboratory scientist receiving evidence, performing analysis, and issuing sealed reports',
            is_system: true,
            permissions: [
                'CASE_READ', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER',
                'FORENSIC_EXAMINE', 'FORENSIC_REPORT',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD'
            ],
        },
        {
            id: 'FORENSIC_EXAMINER',
            agency_branch: 'FORENSICS',
            name: 'Forensic Scientific Examiner',
            description: 'Laboratory scientist receiving evidence, performing analysis, and issuing sealed reports',
            is_system: true,
            permissions: [
                'CASE_READ', 'EVIDENCE_READ', 'EVIDENCE_TRANSFER',
                'FORENSIC_EXAMINE', 'FORENSIC_REPORT',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD'
            ],
        },
        {
            id: 'FSL_TECHNICIAN',
            agency_branch: 'FORENSICS',
            name: 'Forensic Scientific Technician',
            description: 'Scientific assistant aiding in sample preparation and laboratory instrumentation',
            is_system: true,
            permissions: [
                'CASE_READ', 'EVIDENCE_READ', 'FORENSIC_EXAMINE',
                'DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD'
            ],
        },
        {
            id: 'READ_ONLY',
            agency_branch: 'ALL',
            name: 'Read Only User',
            description: 'Read-only inspection access without modification permissions',
            is_system: true,
            permissions: ['CASE_READ', 'FIR_READ', 'COURT_READ', 'DOCUMENT_READ'],
        },
        {
            id: 'AUDITOR',
            agency_branch: 'MASTER',
            name: 'Independent Oversight Auditor',
            description: 'Auditor with read-only inspection authority over cases, evidence, and tamper-evident logs',
            is_system: true,
            permissions: [
                'CASE_READ', 'FIR_READ', 'INVESTIGATION_READ', 'EVIDENCE_READ', 'COURT_READ',
                'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'AUDIT_READ', 'ORG_READ', 'USER_READ'
            ],
        },
        {
            id: 'VIEWER',
            agency_branch: 'MASTER',
            name: 'Authorized Viewer',
            description: 'Read-only access to authorized public cases and proceedings',
            is_system: true,
            permissions: ['CASE_READ', 'FIR_READ', 'DOCUMENT_READ'],
        },
    ];
    for (const r of rolesList) {
        await (0, db_1.query)(`
      INSERT INTO roles (id, agency_branch, name, description, is_system)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, agency_branch = EXCLUDED.agency_branch;
    `, [r.id, r.agency_branch, r.name, r.description, r.is_system]);
        // Role permissions
        for (const permId of r.permissions) {
            await (0, db_1.query)(`
        INSERT INTO role_permissions (role_id, permission_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `, [r.id, permId]);
        }
    }
    // Backfill node_type_id in organization_nodes if not already set
    await (0, db_1.query)(`UPDATE organization_nodes SET node_type_id = type_id WHERE node_type_id IS NULL;`);
    // =========================================================================
    // 5. SEED ONLY ONE INITIAL USER: master_admin
    // All other admins & officers MUST be provisioned through authentic flows!
    // =========================================================================
    console.log('Seeding EXACTLY ONE initial user: master_admin...');
    const masterPasswordHash = await bcryptjs_1.default.hash('Gov@Secure2026!', 10);
    const masterUserRes = await (0, db_1.query)(`
    INSERT INTO users (
      username, email, display_name, badge_number, phone_number,
      designation, department_wing, clearance_level, is_layer_admin,
      password_hash, primary_role_id, primary_organization_id
    ) VALUES (
      'master_admin',
      'master.admin@gujarat.gov.in',
      'State Security & Identity Administrator',
      'MST-001',
      '+91-79-23250001',
      'Chief Technical Secretary & Apex Administrator',
      'State Integrated Justice Mission Directorate',
      'TOP_SECRET',
      TRUE,
      $1,
      'SYSTEM_MASTER_ADMIN',
      $2
    ) RETURNING id;
  `, [masterPasswordHash, masterId]);
    const masterUserId = masterUserRes.rows[0].id;
    // Insert user roles for master_admin
    await (0, db_1.query)(`
    INSERT INTO user_roles (user_id, role_id)
    VALUES ($1, 'SYSTEM_MASTER_ADMIN'), ($1, 'MASTER_ADMIN')
    ON CONFLICT DO NOTHING;
  `, [masterUserId]);
    // Insert root administrative scope for master_admin
    await (0, db_1.query)(`
    INSERT INTO admin_scopes (user_id, organization_node_id, scope_type)
    VALUES ($1, $2, 'SUBTREE')
    ON CONFLICT DO NOTHING;
  `, [masterUserId, masterId]);
    // Record initial audit event
    await (0, db_1.query)(`
    INSERT INTO audit_logs (
      user_id, actor_user_id, organization_id, organization_node_id, body_id,
      action, resource_type, resource_id, result, ip_address, user_agent, after_value, metadata
    ) VALUES (
      $1, $1, $2, $2, 'MASTER',
      'SYSTEM_BOOTSTRAP', 'DATABASE', 'SEED', 'ALLOW', '127.0.0.1', 'SeedScript/2.0',
      '{"status": "System initialized with sovereign trees, reusable roles, and single master admin"}'::jsonb,
      '{"status": "System initialized with sovereign trees, reusable roles, and single master admin"}'::jsonb
    );
  `, [masterUserId, masterId]);
    console.log('================================================================');
    console.log('  ✅ MULTI-AGENCY PLATFORM SEEDED SUCCESSFULLY');
    console.log('  🏛️  Three Sovereign Trees: POLICE, JUDICIARY, FORENSICS (+ MASTER)');
    console.log('  👤 Initial Database User: master_admin (Gov@Secure2026!)');
    console.log('  🛡️  Zero premature transaction records in DB');
    console.log('================================================================');
}
if (require.main === module) {
    seedDatabase()
        .then(() => db_1.pool.end())
        .catch((err) => {
        console.error('Seeding failed:', err);
        process.exit(1);
    });
}
