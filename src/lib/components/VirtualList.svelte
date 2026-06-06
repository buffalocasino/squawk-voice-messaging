<script>
  /**
   * VirtualList.svelte — Performant virtualized scroll container.
   *
   * Renders only visible items + overscan buffer. Smooth 60fps scrolling
   * even with 10,000+ messages. Uses absolute positioning with measured heights.
   *
   * Props:
   *   items: any[]           — array of items to render
   *   key: string            — property name for unique key (default 'id')
   *   estimateHeight: number — estimated item height in px (default 68)
   *   overscan: number       — extra items to render above/below viewport (default 5)
   *
   * Snippets:
   *   children({ item, index }) — renders each visible item
   *   empty()                   — rendered when items is empty
   */

  let {
    items = [],
    key = 'id',
    estimateHeight = 68,
    overscan = 5,
    children,
    empty,
  } = $props()

  // ── DOM refs ──
  let containerEl = $state(null)
  let innerEl = $state(null)

  // ── Scroll & dimension state ──
  let scrollTop = $state(0)
  let viewportHeight = $state(0)
  let totalHeight = $state(0)

  // ── Measured heights cache: key → actual height ──
  let heightCache = $state(new Map())
  let positions = $state([])

  // ── Derived visible range ──
  let visibleRange = $derived.by(() => {
    if (positions.length === 0) return { start: 0, end: 0 }

    const viewTop = scrollTop - overscan * estimateHeight
    const viewBottom = scrollTop + viewportHeight + overscan * estimateHeight

    let start = 0
    let end = positions.length

    let lo = 0, hi = positions.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (positions[mid].top + positions[mid].height < viewTop) {
        lo = mid + 1
      } else {
        start = mid
        hi = mid - 1
      }
    }

    lo = start
    hi = positions.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (positions[mid].top < viewBottom) {
        end = mid + 1
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    start = Math.max(0, start - overscan)
    end = Math.min(positions.length, end + overscan)

    return { start, end }
  })

  // ── Visible items slice ──
  let visibleItems = $derived.by(() => {
    const { start, end } = visibleRange
    return items.slice(start, end).map((item, i) => {
      const idx = start + i
      const pos = positions[idx]
      return {
        item,
        index: idx,
        top: pos?.top ?? idx * estimateHeight,
        key: item[key],
        isScrolledToBottom: scrollTop + viewportHeight >= totalHeight - 60,
      }
    })
  })

  // ── Recalculate positions from height cache ──
  function recalcPositions() {
    let y = 0
    const newPositions = []
    for (const item of items) {
      const id = item[key]
      const h = heightCache.get(id) || estimateHeight
      newPositions.push({ key: id, top: y, height: h })
      y += h
    }
    positions = newPositions
    totalHeight = y
  }

  // ── Measure actual heights after render ──
  function measureHeights() {
    if (!innerEl) return
    const children = innerEl.querySelectorAll('[data-vitem]')
    let changed = false
    for (const el of children) {
      const id = el.dataset.vitem
      const actualHeight = el.offsetHeight
      if (actualHeight > 0 && heightCache.get(id) !== actualHeight) {
        heightCache.set(id, actualHeight)
        changed = true
      }
    }
    if (changed) recalcPositions()
  }

  function onScroll(e) {
    scrollTop = e.target.scrollTop
  }

  // ── Resize observer ──
  $effect(() => {
    const el = containerEl
    if (!el) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        viewportHeight = entry.contentRect.height
      }
    })
    ro.observe(el)
    viewportHeight = el.clientHeight
    return () => ro.disconnect()
  })

  // ── Recalculate when items change ──
  $effect(() => {
    items.length
    recalcPositions()
  })

  // ── Measure after render ──
  $effect(() => {
    visibleItems
    requestAnimationFrame(() => measureHeights())
  })

  // ── Public API ──
  export function scrollToBottom(smooth = true) {
    if (!containerEl) return
    containerEl.scrollTo({
      top: totalHeight,
      behavior: smooth ? 'smooth' : 'instant'
    })
  }

  export function scrollToItem(index) {
    if (!containerEl || index < 0 || index >= positions.length) return
    containerEl.scrollTo({
      top: positions[index].top - viewportHeight / 3,
      behavior: 'smooth'
    })
  }

  export { containerEl }
</script>

<div
  bind:this={containerEl}
  onscroll={onScroll}
  class="virtual-list-container"
  style="overflow-y:auto;overflow-x:hidden;contain:strict;will-change:scroll-position;-webkit-overflow-scrolling:touch;flex:1;min-height:0;"
>
  {#if items.length === 0}
    {#if empty}
      <div class="flex items-center justify-center h-full">
        {@render empty()}
      </div>
    {/if}
  {:else}
    <div bind:this={innerEl} style="position:relative;height:{totalHeight}px;width:100%;">
      {#each visibleItems as { item, index, top, key: itemKey, isScrolledToBottom } (itemKey)}
        <div data-vitem={itemKey} style="position:absolute;top:{top}px;left:0;right:0;">
          {#if children}
            {@render children({ item, index, isScrolledToBottom })}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
