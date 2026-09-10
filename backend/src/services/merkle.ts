import crypto from 'crypto';

/**
 * Binary SHA-256 Merkle tree with inclusion proofs.
 *
 * Purpose: on top of the linear hash-chain (see ledger.ts), Merkle trees let us
 * prove that ONE specific record's block is part of an agreed checkpoint WITHOUT
 * revealing any other block. A verifier holding only the checkpoint's 32-byte
 * root can recompute the root from the record's leaf + a small (log2 n) proof
 * path and confirm membership. This is the standard "proof of inclusion" that
 * makes a chain auditable by third parties who are not allowed to read the whole
 * ledger -- exactly the multi-agency, need-to-know situation this platform is in.
 *
 * Leaves are the block_hash hex strings of a contiguous window of ledger blocks.
 * Odd levels duplicate the last node (Bitcoin-style) so the tree is always full.
 * A domain-separation byte (0x00 leaf / 0x01 interior) blocks second-preimage
 * attacks where an interior node is presented as a leaf.
 */

function sha256(buf: Buffer): Buffer {
  return crypto.createHash('sha256').update(buf).digest();
}

/** Leaf hash of an already-hashed block (hex) with a leaf domain-separation tag. */
export function hashLeaf(blockHashHex: string): Buffer {
  return sha256(Buffer.concat([Buffer.from([0x00]), Buffer.from(blockHashHex, 'hex')]));
}

function hashPair(left: Buffer, right: Buffer): Buffer {
  return sha256(Buffer.concat([Buffer.from([0x01]), left, right]));
}

export interface MerkleProofStep {
  hash: string;          // sibling hash (hex)
  position: 'left' | 'right'; // which side the sibling sits on
}

export interface MerkleProof {
  leaf: string;          // the block_hash this proof is for (hex)
  index: number;         // leaf index within the window
  root: string;          // expected Merkle root (hex)
  path: MerkleProofStep[];
}

/** Compute the Merkle root over an ordered list of block_hash hex strings. */
export function merkleRoot(blockHashes: string[]): string {
  if (blockHashes.length === 0) return '0'.repeat(64);
  let level = blockHashes.map(hashLeaf);
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i]; // duplicate last if odd
      next.push(hashPair(left, right));
    }
    level = next;
  }
  return level[0].toString('hex');
}

/** Build an inclusion proof for the leaf at `index` within `blockHashes`. */
export function buildProof(blockHashes: string[], index: number): MerkleProof {
  if (index < 0 || index >= blockHashes.length) {
    throw new Error(`leaf index ${index} out of range (0..${blockHashes.length - 1})`);
  }
  const path: MerkleProofStep[] = [];
  let level = blockHashes.map(hashLeaf);
  let idx = index;
  while (level.length > 1) {
    const isRightNode = idx % 2 === 1;
    const siblingIdx = isRightNode ? idx - 1 : idx + 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx]; // duplicated last
    path.push({ hash: sibling.toString('hex'), position: isRightNode ? 'left' : 'right' });

    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(hashPair(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return {
    leaf: blockHashes[index],
    index,
    root: level[0].toString('hex'),
    path,
  };
}

/**
 * Verify a proof independently: recompute the root from the leaf + path and
 * compare. Pure function -- no DB, no keys -- so it is the same math a third
 * party (or the frontend) can run to check membership against a known root.
 */
export function verifyProof(proof: MerkleProof): boolean {
  if (!proof || !proof.leaf || !Array.isArray(proof.path)) return false;
  let acc: Buffer;
  try {
    acc = hashLeaf(proof.leaf);
  } catch {
    return false;
  }
  for (const step of proof.path) {
    let sibling: Buffer;
    try {
      sibling = Buffer.from(step.hash, 'hex');
    } catch {
      return false;
    }
    acc = step.position === 'left' ? hashPair(sibling, acc) : hashPair(acc, sibling);
  }
  return acc.toString('hex') === proof.root;
}
