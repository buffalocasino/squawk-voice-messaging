<script>
  /**
   * BottomNav.svelte — mobile tab bar for Squawk.
   *
   * Props:
   *   tabs: Array<{ id, label, icon }> — tab definitions
   *   active: string — currently active tab id
   *   onchange: (tabId) => void — called when a tab is tapped
   */

  let {
    tabs = [
      { id: 'chats',   label: 'Chats',   icon: 'chats' },
      { id: 'settings', label: 'Settings', icon: 'settings' },
    ],
    active = 'chats',
    onchange = (id) => {},
  } = $props()

  // SVG icon paths
  const icons = {
    chats:   { path: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z', viewBox: '0 0 24 24' },
    settings:{ path: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z', viewBox: '0 0 24 24' },
    contacts:{ path: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75', viewBox: '0 0 24 24' },
  }
</script>

<nav class="bottom-nav">
  {#each tabs as tab (tab.id)}
    <button
      class="nav-tab"
      class:active={active === tab.id}
      onclick={() => onchange(tab.id)}
      aria-label={tab.label}
    >
      <svg width="22" height="22" viewBox={icons[tab.icon]?.viewBox || '0 0 24 24'} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d={icons[tab.icon]?.path || ''} />
      </svg>
      <span class="nav-label">{tab.label}</span>
      {#if active === tab.id}
        <span class="nav-indicator"></span>
      {/if}
    </button>
  {/each}
</nav>

<style>
  .bottom-nav {
    display: flex;
    align-items: flex-end;
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    padding-bottom: env(safe-area-inset-bottom);
    z-index: 100;
    flex-shrink: 0;
  }

  .nav-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 0 4px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: color 0.15s;
    position: relative;
    -webkit-tap-highlight-color: transparent;
  }

  .nav-tab.active {
    color: var(--gold);
  }

  .nav-label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .nav-indicator {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 2px;
    border-radius: 0 0 2px 2px;
    background: var(--gold);
  }
</style>
