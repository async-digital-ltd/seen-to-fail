import type { ReplayTrigger } from '@seen-to-fail/replay';

// GitHub Actions' event for each run with records already on main or a waiting
// replay branch when trigger recording was introduced (#120). Reading these
// records must preserve their original content-addressed filenames.
const runs = 'https://github.com/async-digital-ltd/seen-to-fail/actions/runs/';
export const historicalReplayTriggers: ReadonlyMap<string, ReplayTrigger> =
  new Map([
    [runs + '35429662430', 'workflow_dispatch'],
    [runs + '35431432957', 'workflow_dispatch'],
    [runs + '35437095049', 'workflow_dispatch'],
    [runs + '35585966476', 'schedule'],
    [runs + '36412371539', 'schedule'],
    [runs + '36588226891', 'workflow_dispatch'],
    [runs + '37220648439', 'workflow_dispatch'],
    [runs + '37229071997', 'workflow_dispatch'],
    [runs + '37232941491', 'workflow_dispatch'],
    [runs + '37297249729', 'workflow_dispatch'],
    [runs + '38245995640', 'schedule'],
    [runs + '39233374619', 'schedule'],
    [runs + '40304757749', 'schedule'],
    [runs + '40878154653', 'workflow_dispatch'],
    [runs + '41444189227', 'schedule'],
    [runs + '42620497021', 'schedule'],
    [runs + '43869178244', 'schedule'],
    [runs + '44931199009', 'workflow_dispatch'],
  ]);
