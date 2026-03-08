import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderAlertRules } from '../lib/renders/alert-rules.js';

function makeField(value = '') {
  return { value: String(value) };
}

function makeRoot(fields = {}) {
  return {
    innerHTML: '',
    onclick: null,
    onchange: null,
    querySelector(selector) {
      const match = selector.match(/data-alert-rule=\"([^\"]+)\"/);
      if (!match) return null;
      return fields[match[1]] || null;
    }
  };
}

describe('renderAlertRules', () => {
  it('renders the compact form with current thresholds', () => {
    const root = makeRoot();
    renderAlertRules(root, { costUsdThreshold: 0.8, tokenTotalThreshold: 30000, warningCountThreshold: 2 });
    assert.match(root.innerHTML, /비용 spike \(USD\)/);
    assert.match(root.innerHTML, /value="0.8"/);
    assert.match(root.innerHTML, /value="30000"/);
    assert.match(root.innerHTML, /warn 2\+ · cost \$0.80\+ · tokens 30,000\+/);
  });

  it('emits sanitized rules when a field changes', () => {
    const fields = {
      costUsdThreshold: makeField('0.9'),
      tokenTotalThreshold: makeField('27500'),
      warningCountThreshold: makeField('3')
    };
    const root = makeRoot(fields);
    let received = null;

    renderAlertRules(root, {}, {
      onChange(nextRules) {
        received = nextRules;
      }
    });

    root.onchange({ target: { dataset: { alertRule: 'costUsdThreshold' } } });

    assert.deepEqual(received, {
      costUsdThreshold: 0.9,
      tokenTotalThreshold: 27500,
      warningCountThreshold: 3
    });
  });

  it('calls reset when the reset button is clicked', () => {
    const root = makeRoot();
    let resetCount = 0;

    renderAlertRules(root, {}, {
      onReset() {
        resetCount += 1;
      }
    });

    root.onclick({
      target: {
        closest(selector) {
          return selector === '[data-alert-rules-reset]' ? {} : null;
        }
      }
    });

    assert.equal(resetCount, 1);
  });
});
