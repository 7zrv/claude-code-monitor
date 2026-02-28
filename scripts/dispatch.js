import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const base = process.cwd();
const teamPath = join(base, 'agents', 'team.json');

function classify(task) {
  const text = task.toLowerCase();
  const leadKeywords = [
    '우선순위',
    '로드맵',
    'release',
    '릴리스',
    '범위',
    '예산',
    '에스컬레이션',
    '조정',
    '갈등',
    '리스크'
  ];

  if (leadKeywords.some((k) => text.includes(k))) {
    return 'lead';
  }

  const rules = [
    {
      role: 'designer',
      score: ['ui', 'ux', '디자인', '와이어', '색상', '폰트', '레이아웃', '반응형']
    },
    {
      role: 'frontend',
      score: ['프론트', '대시보드', '컴포넌트', '화면', 'css', '렌더링', 'eventsource']
    },
    {
      role: 'backend',
      score: ['백엔드', 'api', 'db', '저장', '수집', '알림', '검증', 'stream', 'rust', 'tauri', 'cargo']
    }
  ];

  const scored = rules
    .map((r) => ({
      role: r.role,
      score: r.score.reduce((acc, keyword) => (text.includes(keyword) ? acc + 1 : acc), 0)
    }))
    .sort((a, b) => b.score - a.score);

  return scored[0].score > 0 ? scored[0].role : 'backend';
}

function checklistFor(role) {
  if (role === 'designer') {
    return ['상태별 화면 정의', '디자인 토큰 명시', '반응형 기준 명시'];
  }
  if (role === 'frontend') {
    return ['API 연결', '오류/로딩 UI 처리', '접근성 점검'];
  }
  if (role === 'backend') {
    return ['입력 검증', '에러 핸들링', '운영 로그/메트릭 포인트'];
  }
  return ['우선순위 결정', '릴리스 게이트 판단', '충돌 중재'];
}

async function main() {
  const task = process.argv.slice(2).join(' ').trim();
  if (!task) {
    console.error('Usage: npm run dispatch -- "작업 설명"');
    process.exit(1);
  }

  const team = JSON.parse(await readFile(teamPath, 'utf8'));
  const roleId = classify(task);
  const role = team.roles.find((r) => r.id === roleId) || team.roles[0];

  const output = {
    inputTask: task,
    lead: team.roles.find((r) => r.id === 'lead')?.name,
    assignee: role.name,
    roleId,
    requiredInput: role.input,
    expectedOutput: role.output,
    checklist: checklistFor(roleId),
    handoffTo:
      roleId === 'lead'
        ? ['designer', 'frontend', 'backend']
        : roleId === 'designer'
          ? ['frontend']
          : roleId === 'frontend'
            ? ['backend']
            : ['frontend']
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
