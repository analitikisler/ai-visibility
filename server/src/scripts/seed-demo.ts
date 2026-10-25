// `npm run seed` (from server/): (re)creates the demo project with 30 days of simulated history.
import { get } from '../db/index.ts';
import { seedDemo } from '../services/seed.ts';

const started = Date.now();
const project = seedDemo();
const counts = get<{ responses: number; mentions: number; citations: number }>(
  `SELECT (SELECT COUNT(*) FROM responses WHERE project_id = :id) responses,
          (SELECT COUNT(*) FROM mentions WHERE project_id = :id) mentions,
          (SELECT COUNT(*) FROM citations WHERE project_id = :id) citations`,
  { id: project.id },
);
console.log(
  `[seed] demo project "${project.name}" (${project.id}): ${project.competitors.length} competitors, ${project.promptCount} prompts, ` +
    `${counts?.responses ?? 0} responses, ${counts?.mentions ?? 0} mentions, ${counts?.citations ?? 0} citations in ${Date.now() - started} ms`,
);
