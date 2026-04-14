/**
 * token-trader status
 *
 * Shows the current month's credit ledger as a simple progress bar.
 */
const { request } = require('../lib/backend');
const auth = require('../lib/auth');

const BAR_WIDTH = 40;
const MONTHLY_GOAL = 20.0;

const MOTIVATIONAL_MESSAGES = [
  'Free Claude Code soon.',
  'Claude gift card in your future.',
  'We didn\'t do it because it was easy, we did it because we thought it was going to be easy.',
  'Keep shipping.',
  'Momentum compounds.',
  'You\'re building something great.',
  'Every impression counts.',
  'You\'re getting closer.',
  'Keep building.',
  'Now you\'re thinking with portals!',
  'Mike was here :)',
  'You da goat!',
  'Take those tokens BACK!!',
  'Pro Tip, use !token-trader status instead',
  'Genuinely thank you for using this!',
  'I made this plugin in a few days!',
  'I barely know how to code! Claude Code Rocks!'
];

function renderBar(fraction) {
  const filled = Math.max(0, Math.min(BAR_WIDTH, Math.round(fraction * BAR_WIDTH)));
  return '[' + '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled) + ']';
}

function formatMonth(monthStr) {
  try {
    const [y, m] = monthStr.split('-');
    const names = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return `${names[parseInt(m, 10) - 1]} ${y}`;
  } catch (_) { return monthStr; }
}

async function run() {
  auth.require();
  let res;
  try {
    res = await request('GET', '/api/v1/ledger', null, { auth: true });
  } catch (err) {
    console.error(`Backend unreachable: ${err.message}`);
    process.exit(2);
  }
  if (res.status !== 200) {
    console.error(`Error ${res.status}: ${res.body?.error || JSON.stringify(res.body)}`);
    process.exit(3);
  }
  const data = res.body;
  const earned = parseFloat(data.earned_amount);
  const fraction = Math.min(1, earned / MONTHLY_GOAL);
  const pct = (fraction * 100).toFixed(1);

  console.log('');
  console.log(`TokenTrader — ${formatMonth(data.month)}`);
  console.log('');
  console.log(`  Earned this month:  $${earned.toFixed(4)} / $${MONTHLY_GOAL.toFixed(2)}`);
  console.log(`  ${renderBar(fraction)}  ${pct}%`);
  console.log('');
  console.log(`  Impressions today:      ${data.today_impressions} / 200`);
  console.log(`  Impressions this month: ${data.total_impressions}`);
  console.log('');

  if (data.gift_card_issued && data.gift_card_code) {
    console.log(`  *** Gift card issued! ***`);
    console.log(`  Code: ${data.gift_card_code}`);
    console.log(`  Redeem at: https://claude.ai/redeem`);
  } else if (data.monthly_cap_reached) {
    console.log(`  You've earned a $${MONTHLY_GOAL.toFixed(2)} gift card!`);
    console.log(`  It will be issued shortly.`);
  } else {
    const msg = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
    console.log(`  ${msg}`);
  }
  console.log('');
}

module.exports = { run };
