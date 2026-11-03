import type { RecordWelsh } from './record-text.ts';

/**
 * The Welsh for every record's text the published page shows (#284), keyed on
 * the English exactly as the record holds it.
 *
 * The records stay in English, as a person or the replay wrote them, and the
 * Welsh page prints their text from here. A key is the record's text, every
 * character of it, so a record whose English is edited, or a new run whose
 * text nobody has translated, has no entry, and the build refuses to publish
 * either page until one is written (see `welshRefusals` in record-text.ts and
 * docs/publishing.md). A text many records share, such as what every replay of
 * a check expected, has one entry.
 *
 * Backticks mark what is printed as it is on both pages, as code: identifiers,
 * file names, commits, branch names, CI step names and quoted tool output.
 * Each has to be printed in the English, as a word of its own, as many times
 * as the Welsh marks it, or the build refuses the entry. Dates are written as
 * the Welsh page writes a day, with the Welsh month.
 *
 * An entry nothing on main shows yet is allowed. Every break `canfail.json`
 * declares, and every check's expected outcome, has its entry here before a
 * replay records it, so the weekly replay never stops the page being published
 * (record-text.test.ts holds that). A key written twice fails to compile.
 */
const entries: Readonly<Record<string, string>> = {
  // The areas.
  Code: 'Cod',
  Build: 'Adeiladu',
  'Published record': 'Cofnod cyhoeddedig',

  // The checks: each one's name, what it protects against, and how to tell it
  // is switched on.
  'Type check': 'Gwiriad mathau',
  'A type error reaching main.': 'Gwall math yn cyrraedd `main`.',
  'The "Type check" step appears in every run of the CI workflow.':
    'Mae’r cam `Type check` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  Lint: 'Gwiriad lint',
  'A lint rule being broken on main.':
    'Rheol lint yn cael ei thorri ar `main`.',
  'The "Lint" step appears in every run of the CI workflow.':
    'Mae’r cam `Lint` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  'Format check': 'Gwiriad fformatio',
  'A file reaching main formatted differently from every other one.':
    'Ffeil yn cyrraedd `main` wedi’i fformatio’n wahanol i bob un arall.',
  'The "Check formatting" step appears in every run of the CI workflow.':
    'Mae’r cam `Check formatting` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  Tests: 'Profion',
  'A defect the test suite covers reaching main.':
    'Nam y mae’r gyfres brofion yn ei gwmpasu yn cyrraedd `main`.',
  'The "Test" step appears in every run of the CI workflow.':
    'Mae’r cam `Test` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  'Generated types are current': 'Mae’r mathau a gynhyrchwyd yn gyfredol',
  'A schema or query edited without regenerating the types both sides read.':
    'Sgema neu ymholiad wedi’i olygu heb ailgynhyrchu’r mathau y mae’r ddwy ochr yn eu darllen.',
  'The "Check the generated types are current" step appears in every run of the CI workflow.':
    'Mae’r cam `Check the generated types are current` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  'Workflow lint': 'Gwiriad lint y llifoedd gwaith',
  "A workflow GitHub would read differently from how it was written: a mistyped input name, which GitHub reads as an empty string rather than refusing, a bad expression or a wrong key, in a workflow that runs only on dispatch or on the schedule and so fails nowhere before it matters. And a shell script under scripts/, several of which the CI job runs, that does something other than its author meant, such as a variable left unquoted and split into words, which can make a check pass that should fail. And a `uses:` in a workflow that names a tag or a branch rather than a full commit SHA, which actionlint accepts and which anyone who can write to that action's repository can move to other code.":
    'Llif gwaith y byddai GitHub yn ei ddarllen yn wahanol i’r ffordd y cafodd ei ysgrifennu: enw mewnbwn wedi’i gamdeipio, y mae GitHub yn ei ddarllen fel llinyn gwag yn hytrach na’i wrthod, mynegiad gwael neu allwedd anghywir, mewn llif gwaith sy’n rhedeg dim ond pan gaiff ei gychwyn â llaw neu ar yr amserlen, ac felly nad yw’n methu yn unman cyn bod hynny o bwys. A sgript gragen dan `scripts/`, y mae’r swydd CI yn rhedeg sawl un ohonynt, sy’n gwneud rhywbeth heblaw’r hyn a fwriadai ei hawdur, fel newidyn a adawyd heb ddyfynodau ac a holltwyd yn eiriau, a all wneud i wiriad basio a ddylai fethu. A `uses:` mewn llif gwaith sy’n enwi tag neu gangen yn hytrach nag SHA ymrwymiad llawn, y mae `actionlint` yn ei dderbyn ac y gall unrhyw un sy’n gallu ysgrifennu i ystorfa’r weithred honno ei symud i god arall.',
  'The "Lint the workflows" step appears in every run of the CI workflow.':
    'Mae’r cam `Lint the workflows` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  'The client builds': 'Mae’r cleient yn adeiladu',
  'A client that type checks and cannot be bundled, which the tests cannot see because they import modules rather than the page.':
    'Cleient sy’n pasio’r gwiriad mathau ond na ellir ei fwndelu, na all y profion ei weld oherwydd eu bod yn mewnforio modiwlau yn hytrach na’r dudalen.',
  'The "Build the client" step appears in every run of the CI workflow.':
    'Mae’r cam `Build the client` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  'The client bundle holds to its baseline':
    'Mae bwndel y cleient yn cadw at ei linell sylfaen',
  'A client bundle that grows past the baseline committed in packages/web/bundle-baseline.json by more than its tolerance, which the build itself accepts because a bigger bundle still builds.':
    'Bwndel cleient sy’n tyfu y tu hwnt i’r llinell sylfaen a ymrwymwyd yn `packages/web/bundle-baseline.json` o fwy na’i oddefiant, y mae’r broses adeiladu ei hun yn ei dderbyn am fod bwndel mwy yn dal i adeiladu.',
  'The "Check the client bundle against its baseline" step appears in every run of the CI workflow.':
    'Mae’r cam `Check the client bundle against its baseline` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  'The server starts': 'Mae’r gweinydd yn cychwyn',
  'A server whose entry point does not load, or never listens, which the tests cannot see because they put requests through the handler and never run the entry point.':
    'Gweinydd nad yw ei bwynt mynediad yn llwytho, neu nad yw byth yn gwrando, na all y profion ei weld oherwydd eu bod yn anfon ceisiadau drwy’r trinydd a byth yn rhedeg y pwynt mynediad.',
  'The "Check the server starts" step appears in every run of the CI workflow.':
    'Mae’r cam `Check the server starts` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  'The published page is checked after it is built':
    'Mae’r dudalen a gyhoeddir yn cael ei gwirio ar ôl ei hadeiladu',
  "A published page that names no commit it was built from, or that works something out in the reader's browser rather than at build time.":
    'Tudalen a gyhoeddwyd nad yw’n enwi unrhyw ymrwymiad y’i hadeiladwyd ohono, neu sy’n cyfrifo rhywbeth ym mhorwr y darllenydd yn hytrach nag wrth ei hadeiladu.',
  'The "Check the published output" step appears in every run of the CI workflow.':
    'Mae’r cam `Check the published output` yn ymddangos ym mhob rhediad o’r llif gwaith CI.',

  'The ledger refuses a malformed record':
    'Mae’r cyfriflyfr yn gwrthod cofnod camffurfiedig',
  'A record that breaks a rule being committed, and then published as though it were true.':
    'Cofnod sy’n torri rheol yn cael ei ymrwymo, ac yna’n cael ei gyhoeddi fel petai’n wir.',
  'Both recording workflows run "pnpm ledger:validate" before they commit, and CI runs it again on every pull request and every push to main or a ci-control branch.':
    'Mae’r ddau lif gwaith cofnodi yn rhedeg `pnpm ledger:validate` cyn iddynt ymrwymo, ac mae CI yn ei redeg eto ar bob cais tynnu a phob gwthiad i `main` neu i gangen `ci-control`.',

  'The build refuses to publish a disagreement':
    'Mae’r broses adeiladu yn gwrthod cyhoeddi anghytundeb',
  'A published page that quietly holds fewer runs, or different counts, than the record it was built from.':
    'Tudalen a gyhoeddwyd sydd, heb ddweud dim, yn dal llai o rediadau, neu gyfrifon gwahanol, na’r cofnod y’i hadeiladwyd ohono.',
  'The "Build the published ledger" step appears in every run of the CI workflow, and it writes nothing when the two disagree.':
    'Mae’r cam `Build the published ledger` yn ymddangos ym mhob rhediad o’r llif gwaith CI, ac nid yw’n ysgrifennu dim pan fydd y ddau’n anghytuno.',

  // What each check is expected to do when a defect is planted, as
  // canfail.json declares it for the replay and as the runs by hand wrote it.
  'The type check fails.': 'Mae’r gwiriad mathau yn methu.',
  'The lint fails.': 'Mae’r gwiriad lint yn methu.',
  'The format check fails.': 'Mae’r gwiriad fformatio yn methu.',
  'The tests fail.': 'Mae’r profion yn methu.',
  'The workflow lint or the script lint fails.':
    'Mae gwiriad lint y llifoedd gwaith neu wiriad lint y sgriptiau yn methu.',
  'The workflow lint fails.': 'Mae gwiriad lint y llifoedd gwaith yn methu.',
  'The client build fails.': 'Mae adeiladu’r cleient yn methu.',
  'The bundle check fails, so the run does not go green.':
    'Mae’r gwiriad bwndel yn methu, felly nid yw’r rhediad yn troi’n wyrdd.',
  'The server start check fails, so the run does not go green.':
    'Mae’r gwiriad bod y gweinydd yn cychwyn yn methu, felly nid yw’r rhediad yn troi’n wyrdd.',
  'The check of the published output fails, so the run does not go green.':
    'Mae’r gwiriad ar yr allbwn a gyhoeddwyd yn methu, felly nid yw’r rhediad yn troi’n wyrdd.',
  'The validator refuses the ledger and exits non-zero, and nothing is recorded.':
    'Mae’r dilyswr yn gwrthod y cyfriflyfr ac yn gadael â chod heblaw sero, ac ni chofnodir dim.',
  'The build refuses to publish, exits non-zero, and writes no files at all.':
    'Mae’r broses adeiladu yn gwrthod cyhoeddi, yn gadael â chod heblaw sero, ac nid yw’n ysgrifennu unrhyw ffeil o gwbl.',
  'The step fails, so the run does not go green.':
    'Mae’r cam yn methu, felly nid yw’r rhediad yn troi’n wyrdd.',
  'The Type check step fails, so the CI run does not go green.':
    'Mae’r cam `Type check` yn methu, felly nid yw’r rhediad CI yn troi’n wyrdd.',
  'The Lint the workflows step fails, so the CI run does not go green.':
    'Mae’r cam `Lint the workflows` yn methu, felly nid yw’r rhediad CI yn troi’n wyrdd.',
  'The Check the server starts step fails, so the CI run does not go green.':
    'Mae’r cam `Check the server starts` yn methu, felly nid yw’r rhediad CI yn troi’n wyrdd.',
  'The check fails because regenerating the types changes the committed generated files.':
    'Mae’r gwiriad yn methu am fod ailgynhyrchu’r mathau yn newid y ffeiliau a gynhyrchwyd ac a ymrwymwyd.',

  // The breaks canfail.json declares, which every replay records as what was
  // planted, in the order it declares them.
  'STATUSES loses its as const, so Status widens to string.':
    'Mae `STATUSES` yn colli ei `as const`, felly mae `Status` yn lledu i `string`.',
  'STALE_AFTER_DAYS is written as a string rather than a number.':
    'Mae `STALE_AFTER_DAYS` wedi’i ysgrifennu fel llinyn yn hytrach na rhif.',
  'The build writes a script tag into the page after the page it checked, so the file on disk is not the page it verified.':
    'Mae’r broses adeiladu yn ysgrifennu tag sgript i’r dudalen ar ôl y dudalen a wiriodd, felly nid y ffeil ar y ddisg yw’r dudalen a ddilysodd.',
  'The build reads the commit it was built from as the parent of HEAD, so the page\'s "Built from" lines name a commit the page was not built from.':
    'Mae’r broses adeiladu yn darllen yr ymrwymiad y mae’n adeiladu ohono fel rhiant `HEAD`, felly mae llinellau “Adeiladwyd o ymrwymiad” y dudalen yn enwi ymrwymiad nad adeiladwyd y dudalen ohono.',
  'One observation dropped from the export, inside the function that builds it, so the page holds one fewer than the ledger.':
    'Un arsylwad wedi’i ollwng o’r allforiad, y tu mewn i’r ffwythiant sy’n ei adeiladu, felly mae gan y dudalen un yn llai na’r cyfriflyfr.',
  'The status tally counts nothing, so every tile on the page says zero however many checks hold that status.':
    'Nid yw’r cyfrif statws yn cyfrif dim, felly mae pob teilsen ar y dudalen yn dangos sero, faint bynnag o wiriadau sydd â’r statws hwnnw.',
  'A run file whose outcome is a word the ledger does not know.':
    'Ffeil rhediad y mae ei chanlyniad yn air nad yw’r cyfriflyfr yn ei adnabod.',
  'A run file naming a check that is not in the ledger.':
    'Ffeil rhediad sy’n enwi gwiriad nad yw yn y cyfriflyfr.',
  'record-run.yml reads inputs.check_id where the input is named check-id, which GitHub reads as an empty string rather than an error.':
    'Mae `record-run.yml` yn darllen `inputs.check_id` lle mae’r mewnbwn wedi’i enwi’n `check-id`, y mae GitHub yn ei ddarllen fel llinyn gwag yn hytrach na gwall.',
  'replay.yml reads inputs.only_due where the input is named only-due, so a dispatch ticked to replay only what is due would replay everything.':
    'Mae `replay.yml` yn darllen `inputs.only_due` lle mae’r mewnbwn wedi’i enwi’n `only-due`, felly byddai rhediad a gychwynnwyd â llaw, wedi’i dicio i ailchwarae dim ond yr hyn sy’n ddyledus, yn ailchwarae popeth.',
  'check-published-output.sh leaves $page unquoted in its first test, so a path to the page with a space in it would be split into separate words.':
    'Mae `check-published-output.sh` yn gadael `$page` heb ddyfynodau yn ei phrawf cyntaf, felly byddai llwybr i’r dudalen â bwlch ynddo yn cael ei hollti’n eiriau ar wahân.',
  'waiting-branches.yml uses actions/checkout@v7, a tag anyone who can write to that repository can move, rather than a commit SHA, which actionlint accepts.':
    'Mae `waiting-branches.yml` yn defnyddio `actions/checkout@v7`, tag y gall unrhyw un sy’n gallu ysgrifennu i’r ystorfa honno ei symud, yn hytrach nag SHA ymrwymiad, ac mae `actionlint` yn derbyn hynny.',
  'The entry point imports ./environment without its file extension, which the type check accepts and Node cannot resolve.':
    'Mae’r pwynt mynediad yn mewnforio `./environment` heb estyniad y ffeil, y mae’r gwiriad mathau yn ei dderbyn ac na all Node ei ddatrys.',
  'The entry point starts a timer where it would listen, so the process stays up and never binds the port.':
    'Mae’r pwynt mynediad yn cychwyn amserydd lle byddai’n gwrando, felly mae’r broses yn aros yn fyw ac nid yw byth yn rhwymo’r porth.',
  'REPLAY_AFTER_DAYS loses the semicolon every other statement ends with, which the type check and the tests both accept.':
    'Mae `REPLAY_AFTER_DAYS` yn colli’r hanner colon y mae pob datganiad arall yn gorffen ag ef, ac mae’r gwiriad mathau a’r profion ill dau yn derbyn hynny.',
  'The filter hook drops the promise navigate returns without marking it as dropped, which the type check accepts.':
    'Mae’r bachyn hidlo yn gollwng yr addewid a ddychwelir gan `navigate` heb nodi ei fod wedi’i ollwng, ac mae’r gwiriad mathau yn derbyn hynny.',
  "A link's day count accepts a leading zero, so one filter has two links, which the type check accepts.":
    'Mae cyfrif diwrnodau dolen yn derbyn sero ar y dechrau, felly mae gan un hidlydd ddwy ddolen, ac mae’r gwiriad mathau yn derbyn hynny.',
  "The page's script names /src/main.ts where the entry is /src/main.tsx, which the type check cannot see because it never reads the page.":
    'Mae sgript y dudalen yn enwi `/src/main.ts` lle mai `/src/main.tsx` yw’r pwynt mynediad, ac ni all y gwiriad mathau weld hynny am nad yw byth yn darllen y dudalen.',
  'The client entry imports the whole of graphql and keeps it, which builds and type checks while the JavaScript grows by about half.':
    'Mae pwynt mynediad y cleient yn mewnforio’r cyfan o `graphql` ac yn ei gadw, sy’n adeiladu ac yn pasio’r gwiriad mathau tra bo’r JavaScript yn tyfu tua hanner.',
  'The base stylesheet gains four shadow classes nothing uses, which grows the CSS by about one and a half per cent and the whole build by well under one, so only the CSS limit can catch it.':
    'Mae’r ddalen arddull sylfaenol yn ennill pedwar dosbarth cysgod nad oes dim yn eu defnyddio, sy’n tyfu’r CSS tua un a hanner y cant a’r allbwn adeiladu cyfan ymhell dan un y cant, felly dim ond terfyn y CSS a all ddal y newid.',

  // What was planted in the runs recorded by hand.
  'A script tag appended to the built page, which the step exists to refuse.':
    'Tag sgript wedi’i atodi i’r dudalen a adeiladwyd, y mae’r cam yn bod er mwyn ei wrthod.',
  'A run file whose outcome was neither caught nor missed, and a second file naming a check that does not exist, dated in the future.':
    'Ffeil rhediad nad oedd ei chanlyniad yn `caught` nac yn `missed`, ac ail ffeil sy’n enwi gwiriad nad yw’n bod, wedi’i dyddio yn y dyfodol.',
  'One record dropped from the export, inside the function that builds it, so the page held five arming observations where the ledger held six.':
    'Un cofnod wedi’i ollwng o’r allforiad, y tu mewn i’r ffwythiant sy’n ei adeiladu, felly roedd gan y dudalen bum arsylwad ymlaen neu i ffwrdd lle roedd gan y cyfriflyfr chwech.',
  'STALE_AFTER_DAYS was changed from the number 30 to the string 30 in quotes, on a ci-control branch pushed to this repository.':
    'Newidiwyd `STALE_AFTER_DAYS` o’r rhif 30 i’r llinyn 30 mewn dyfynodau, ar gangen `ci-control` a wthiwyd i’r ystorfa hon.',
  "The entry point's import of ./environment.ts lost its file extension, on a ci-control branch pushed to this repository.":
    'Collodd mewnforiad `./environment.ts` yn y pwynt mynediad estyniad ei ffeil, ar gangen `ci-control` a wthiwyd i’r ystorfa hon.',
  'inputs.check-id typed as inputs.check_id in record-run.yml and inputs.only-due typed as inputs.only_due in replay.yml, pushed as fcf8ee3 to the pull request for #157.':
    '`inputs.check-id` wedi’i deipio fel `inputs.check_id` yn `record-run.yml`, ac `inputs.only-due` wedi’i deipio fel `inputs.only_due` yn `replay.yml`, wedi’u gwthio fel `fcf8ee3` i’r cais tynnu ar gyfer #157.',
  'The StatusCounts query in packages/web/src/graphql/status-counts.graphql drops its total field, committed without regenerating the types (b2050a3 on ci-control/codegen-stale-query).':
    'Mae’r ymholiad `StatusCounts` yn `packages/web/src/graphql/status-counts.graphql` yn gollwng ei faes `total`, wedi’i ymrwymo heb ailgynhyrchu’r mathau (`b2050a3` ar `ci-control/codegen-stale-query`).',

  // The notes on the runs recorded by hand.
  'Seen on 2026-09-18 while building #63. The validator exited 0 before the plant, 1 with each plant in place, and 0 again once both were removed.':
    'Gwelwyd ar 18 Medi 2026 wrth adeiladu #63. Gadawodd y dilyswr â chod 0 cyn plannu’r namau, 1 gyda phob un yn ei le, a 0 eto ar ôl tynnu’r ddau.',
  'Seen on 2026-09-18 while building #63. The build published before the plant, refused with it in place and left no output directory behind, and published again once it was removed.':
    'Gwelwyd ar 18 Medi 2026 wrth adeiladu #63. Cyhoeddodd y broses adeiladu cyn plannu’r nam, gwrthododd gyda’r nam yn ei le heb adael cyfeiriadur allbwn ar ôl, a chyhoeddodd eto ar ôl ei dynnu.',
  'Seen on 2026-09-18 while building #63, against a copy of the real built page. Worth knowing how it got here: the step was first written as a negated grep, and set -e does not apply to a command whose status is inverted, so that version went green with the script sitting in the page. The plant is what showed it up. It was rewritten as an if and seen to deny before it ran anywhere.':
    'Gwelwyd ar 18 Medi 2026 wrth adeiladu #63, yn erbyn copi o’r dudalen go iawn a adeiladwyd. Mae’n werth gwybod sut y daeth i hyn: ysgrifennwyd y cam yn gyntaf fel `grep` wedi’i wrthdroi, ac nid yw `set -e` yn berthnasol i orchymyn y mae ei statws wedi’i wrthdroi, felly trodd y fersiwn honno’n wyrdd gyda’r sgript yn eistedd yn y dudalen. Y nam a blannwyd a ddangosodd hynny. Ailysgrifennwyd y cam fel `if`, a gwelwyd ef yn gwrthod cyn iddo redeg yn unman.',
  'Run 36984692843 of the CI workflow at fcf8ee3 concluded failure, with Lint the workflows the step that failed, on exit 1, and every step after it skipped. It named both lines. Run 36984912818 at c89be24, with both plants removed, passed. Typed in on 4 October 2026 from those two runs and from the account on #157, by a session that did not watch them (#190).':
    'Daeth rhediad 36984692843 o’r llif gwaith CI ar `fcf8ee3` i ben â methiant, gyda `Lint the workflows` y cam a fethodd, â chod gadael 1, a phob cam ar ei ôl wedi’i hepgor. Enwodd y ddwy linell. Pasiodd rhediad 36984912818 ar `c89be24`, gyda’r ddau nam wedi’u tynnu. Teipiwyd i mewn ar 4 Hydref 2026 o’r ddau rediad hynny ac o’r hanes ar #157, gan sesiwn na wyliodd mohonynt (#190).',
  'Recorded by hand because a replay cannot plant this: the check only sees a committed defect, and a replay never commits its breaks (#228). CI run https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37295226381 failed at the generated-types step with a diff of gql.ts and graphql.ts removing total.':
    'Cofnodwyd â llaw am na all ailchwarae blannu hyn: dim ond nam sydd wedi’i ymrwymo y mae’r gwiriad yn ei weld, ac nid yw ailchwarae byth yn ymrwymo’r namau y mae’n eu plannu (#228). Methodd rhediad CI `https://github.com/async-digital-ltd/seen-to-fail/actions/runs/37295226381` wrth y cam sy’n gwirio’r mathau a gynhyrchwyd, gyda gwahaniaeth i `gql.ts` a `graphql.ts` a oedd yn tynnu `total`.',
  'Planted on the ci-control lane the README documents. Run 37219973975 on branch ci-control/146-server-start-plant at e50ff76 concluded failure, with Check the server starts the only step that failed, on exit 1, every step before it green and every step after it skipped: the type check accepts the import and Node cannot resolve it. Run 36991152739 on main at a7cd00d, the same tree without the plant, passed the step. The pull request that added the step, #145, gives an account of more plants watched failing it locally on 27 September 2026, which nothing here can check (#146).':
    'Plannwyd ar lôn `ci-control` a ddisgrifir yn y README. Daeth rhediad 37219973975 ar y gangen `ci-control/146-server-start-plant` ar `e50ff76` i ben â methiant, gyda `Check the server starts` yr unig gam a fethodd, â chod gadael 1, pob cam o’i flaen yn wyrdd a phob cam ar ei ôl wedi’i hepgor: mae’r gwiriad mathau yn derbyn y mewnforiad ac ni all Node ei ddatrys. Ar `main` ar `a7cd00d`, yr un goeden heb y nam, pasiodd rhediad 36991152739 y cam. Mae’r cais tynnu a ychwanegodd y cam, #145, yn rhoi hanes rhagor o namau a welwyd yn ei fethu’n lleol ar 27 Medi 2026, na all dim yma ei wirio (#146).',
  'Planted on the ci-control lane the README documents. Run 35405796729 on branch ci-control/63-type-check-plant at d6c0575 concluded failure, with Type check the only step that failed and every other step green or skipped. The branch was deleted and the constant put back afterwards.':
    'Plannwyd ar lôn `ci-control` a ddisgrifir yn y README. Daeth rhediad 35405796729 ar y gangen `ci-control/63-type-check-plant` ar `d6c0575` i ben â methiant, gyda `Type check` yr unig gam a fethodd a phob cam arall yn wyrdd neu wedi’i hepgor. Dilëwyd y gangen a rhoddwyd y cysonyn yn ôl wedyn.',

  // Why a replay settled nothing, as canfail reported it.
  'the check already FAILS on the clean tree (exit 1: [ELIFECYCLE] Test failed. See above for more details.) — breaking something can prove nothing from here':
    'mae’r gwiriad eisoes yn METHU ar y goeden lân (cod gadael 1: `[ELIFECYCLE] Test failed. See above for more details.`), felly ni all torri rhywbeth brofi dim o’r fan hon',

  // The notes on the observations of whether a check is switched on.
  'Read from run 35375392138 of the CI workflow on main at 14b479e, where the step ran and the run concluded success.':
    'Darllenwyd o rediad 35375392138 o’r llif gwaith CI ar `main` ar `14b479e`, lle rhedodd y cam a daeth y rhediad i ben yn llwyddiannus.',
  'Read from run 36817268610 of the CI workflow on main at 237698b, where the "Check the published output" step ran and the run concluded success.':
    'Darllenwyd o rediad 36817268610 o’r llif gwaith CI ar `main` ar `237698b`, lle rhedodd y cam `Check the published output` a daeth y rhediad i ben yn llwyddiannus.',
  'Read from run 36817268610 of the CI workflow on main at 237698b, where the "Check the ledger reads" step ran pnpm ledger:validate and the run concluded success. The two recording workflows were not read for this observation.':
    'Darllenwyd o rediad 36817268610 o’r llif gwaith CI ar `main` ar `237698b`, lle rhedodd y cam `Check the ledger reads` y gorchymyn `pnpm ledger:validate` a daeth y rhediad i ben yn llwyddiannus. Ni ddarllenwyd y ddau lif gwaith cofnodi ar gyfer yr arsylwad hwn.',
  'Read from run 36817268610 of the CI workflow on main at 237698b, where the "Build the published ledger" step ran and the run concluded success.':
    'Darllenwyd o rediad 36817268610 o’r llif gwaith CI ar `main` ar `237698b`, lle rhedodd y cam `Build the published ledger` a daeth y rhediad i ben yn llwyddiannus.',
  'Read on 4 October 2026 from run 36991152739 of the CI workflow on main at a7cd00d, which ran on 2 October 2026: the "Lint the workflows" step ran and the run concluded success.':
    'Darllenwyd ar 4 Hydref 2026 o rediad 36991152739 o’r llif gwaith CI ar `main` ar `a7cd00d`, a redodd ar 2 Hydref 2026: rhedodd y cam `Lint the workflows` a daeth y rhediad i ben yn llwyddiannus.',
  'Read on 4 October 2026 from run 36991152739 of the CI workflow on main at a7cd00d, which ran on 2 October 2026: the "Check the server starts" step ran and the run concluded success.':
    'Darllenwyd ar 4 Hydref 2026 o rediad 36991152739 o’r llif gwaith CI ar `main` ar `a7cd00d`, a redodd ar 2 Hydref 2026: rhedodd y cam `Check the server starts` a daeth y rhediad i ben yn llwyddiannus.',
  'Read on 29 October 2026 from run 39404331122 of the CI workflow on main at 0aa2082, which ran on 20 October 2026: the "Check the client bundle against its baseline" step ran and the run concluded success.':
    'Darllenwyd ar 29 Hydref 2026 o rediad 39404331122 o’r llif gwaith CI ar `main` ar `0aa2082`, a redodd ar 20 Hydref 2026: rhedodd y cam `Check the client bundle against its baseline` a daeth y rhediad i ben yn llwyddiannus.',
};

export const recordWelsh: RecordWelsh = new Map(Object.entries(entries));
