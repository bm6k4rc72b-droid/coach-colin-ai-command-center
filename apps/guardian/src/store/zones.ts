import { db } from './db.ts';
import type { Point, Zone } from '../core/types.ts';

interface Row { id: string; name: string; armed: number; points_json: string }

export async function listZones(): Promise<Zone[]> {
  const d = await db();
  const rows = await d.getAllAsync<Row>('SELECT * FROM zones ORDER BY name');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    armed: r.armed === 1,
    points: JSON.parse(r.points_json) as Point[],
  }));
}

export async function saveZone(z: Zone): Promise<void> {
  const d = await db();
  await d.runAsync(
    `INSERT INTO zones (id, name, armed, points_json) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, armed = excluded.armed, points_json = excluded.points_json`,
    z.id, z.name, z.armed ? 1 : 0, JSON.stringify(z.points),
  );
}

export async function deleteZone(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM zones WHERE id = ?', id);
}
