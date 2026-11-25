import { check, error, readProjectFile, text, verdict, z } from '@cairul/plugin-kit';

export default function coverage() {
  return {
    checkKinds: {
      'coverage.lcov-threshold': check(
        z.strictObject({
          report: text,
          metric: z.enum(['lines', 'branches', 'functions']).default('lines'),
          minimum: z.number().min(0).max(100),
        }),
        async ({ report, metric, minimum }, { projectDir, signal }) => {
          try {
            const source = await readProjectFile(projectDir, report, signal);
            if (!source.trimEnd().endsWith('end_of_record')) return error('LCOV report is incomplete.');
            const [foundKey, hitKey] = { lines: ['LF', 'LH'], branches: ['BRF', 'BRH'], functions: ['FNF', 'FNH'] }[
              metric
            ];
            let found = 0;
            let hit = 0;
            for (const record of source.split('end_of_record')) {
              if (!record.trim()) continue;
              const file = record.trim();
              if (!/^SF:.+/m.test(file)) return error('LCOV report has a record without a source file.');
              const totals = [...file.matchAll(/^([A-Z]+):(\d+)\s*$/gm)];
              const foundCounts = totals.filter(([, key]) => key === foundKey);
              const hitCounts = totals.filter(([, key]) => key === hitKey);
              if (!foundCounts.length && !hitCounts.length) continue;
              if (
                foundCounts.length !== 1 ||
                hitCounts.length !== 1 ||
                Number(hitCounts[0][2]) > Number(foundCounts[0][2])
              ) {
                return error('LCOV report has invalid coverage counts.');
              }
              found += Number(foundCounts[0][2]);
              hit += Number(hitCounts[0][2]);
            }
            if (!found) return verdict(false, `No ${metric} measured.`);
            const percent = (100 * hit) / found;
            return verdict(percent >= minimum, `${percent.toFixed(2)}% of ${metric} covered; required ${minimum}%.`);
          } catch (cause) {
            return cause?.code === 'ENOENT'
              ? verdict(false, 'Waiting for coverage report.')
              : error('Coverage report is unreadable.');
          }
        }
      ),
    },
  };
}
