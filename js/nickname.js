// ============================================================
//  PAPAP DOL — Nickname Module
// ============================================================
import { appState, showScreen } from './main.js';
import { SCREEN }               from './utils/constants.js';
import { generatePlayerId }     from './utils/names.js';

export function initNickname() {
  const input    = document.getElementById('nickname-input');
  const errorEl  = document.getElementById('nickname-error');
  const continueBtn = document.getElementById('btn-nickname-continue');

  // Pre-fill if saved
  const saved = localStorage.getItem('papap_nickname');
  if (saved) input.value = saved;

  continueBtn.addEventListener('click', submitNickname);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitNickname(); });

  // Change nickname from settings
  const changeBtn = document.getElementById('btn-change-nickname');
  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      document.getElementById('settings-modal').classList.remove('open');
      showScreen(SCREEN.NICKNAME);
    });
  }

  function submitNickname() {
    const val = input.value.trim();
    if (val.length < 3) {
      errorEl.textContent = 'Nickname must be at least 3 characters.';
      return;
    }
    if (val.length > 15) {
      errorEl.textContent = 'Nickname cannot exceed 15 characters.';
      return;
    }
    errorEl.textContent = '';

    appState.nickname = val;
    localStorage.setItem('papap_nickname', val);

    let pid = localStorage.getItem('papap_player_id');
    if (!pid) {
      pid = generatePlayerId();
      localStorage.setItem('papap_player_id', pid);
    }
    appState.playerId = pid;

    showScreen(SCREEN.MENU);
  }
}
