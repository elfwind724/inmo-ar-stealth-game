const readEvent = `
  SELECT phase, access_digest
  FROM christmas_rehearsal_event WHERE singleton
`;

const readTeams = 'SELECT name_key, name, number, revealed FROM christmas_rehearsal_teams';

function eventState(event, rows) {
  if (!event) throw new Error('Rehearsal event row is missing');
  return {
    phase: event.phase,
    accessDigest: event.access_digest,
    teams: rows.filter((row) => row.name_key !== null).map((row) => ({
      key: row.name_key,
      name: row.name,
      number: row.number,
      revealed: row.revealed,
    })),
  };
}

async function saveChanges(client, before, after) {
  const keys = new Set(after.teams.map((team) => team.key));
  const removed = before.teams.filter((team) => !keys.has(team.key)).map((team) => team.key);
  if (removed.length) {
    await client.query('DELETE FROM christmas_rehearsal_teams WHERE name_key = ANY($1::text[])', [removed]);
  }

  const previous = new Map(before.teams.map((team) => [team.key, team]));
  const changed = after.teams.filter((team) => {
    const old = previous.get(team.key);
    return !old || team.name !== old.name || team.number !== old.number || team.revealed !== old.revealed;
  });
  if (changed.length) {
    await client.query(`
      INSERT INTO christmas_rehearsal_teams (name_key, name, number, revealed)
      SELECT key, name, number, revealed
      FROM jsonb_to_recordset($1::jsonb) AS teams(key text, name text, number integer, revealed boolean)
      ON CONFLICT (name_key) DO UPDATE SET
        name = EXCLUDED.name,
        number = EXCLUDED.number,
        revealed = EXCLUDED.revealed
    `, [JSON.stringify(changed)]);
  }

  if (before.phase !== after.phase || before.accessDigest !== after.accessDigest) {
    await client.query(`
      UPDATE christmas_rehearsal_event SET phase = $1, access_digest = $2 WHERE singleton
    `, [after.phase, after.accessDigest]);
  }
}

export function createPostgresStore(getPool) {
  return {
    async read() {
      const { rows } = await getPool().query(`
        SELECT event.phase, event.access_digest, team.name_key, team.name, team.number, team.revealed
        FROM christmas_rehearsal_event AS event
        LEFT JOIN christmas_rehearsal_teams AS team ON true
        WHERE event.singleton
      `);
      return eventState(rows[0], rows);
    },

    async update(change) {
      const client = await getPool().connect();
      let brokenConnection;
      try {
        await client.query('BEGIN');
        // Every writer takes this lock first, including the organizer's phase transitions.
        const event = await client.query(`${readEvent} FOR UPDATE`);
        const teams = await client.query(readTeams);
        const before = eventState(event.rows[0], teams.rows);
        const after = structuredClone(before);
        const result = await change(after);
        await saveChanges(client, before, after);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          brokenConnection = rollbackError;
        }
        throw error;
      } finally {
        client.release(brokenConnection);
      }
    },
  };
}
