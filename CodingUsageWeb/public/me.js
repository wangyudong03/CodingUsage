/**
 * Me 页面特有逻辑
 * 处理解绑、切换公开状态和趋势图粒度切换
 */

document.addEventListener('DOMContentLoaded', () => {
  const basePath = window.BASE_PATH || '';

  // ==================== 切换公开状态 ====================
  document.querySelectorAll('.toggle-public').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apiKey = btn.getAttribute('data-key');
      try {
        const res = await fetch(`${basePath}/toggle-public`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            bound_keys: getBoundApiKeys()
          })
        });
        if (res.ok) {
          window.location.reload();
        }
      } catch (err) {
        console.error('Failed to toggle public status', err);
      }
    });
  });

  // ==================== 解绑 ====================
  document.querySelectorAll('.unbind-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apiKey = btn.getAttribute('data-key');
      // 从本地存储移除，不需要确认
      removeBoundApiKey(apiKey);
      window.location.reload();
    });
  });

  // ==================== 趋势图粒度切换 ====================
  const granularityTitles = {
    day: 'Usage Trend (30 days)',
    hour: 'Usage Trend (7 days hourly)',
    minute: 'Usage Trend (24 hours)'
  };

  // 格式化使用量（美元或次数）
  function formatUsage(value, isTrae) {
    if (isTrae) return value;
    return `$${((value || 0) / 100).toFixed(2)}`;
  }

  // 渲染 SVG 趋势图
  function renderTrendChart(container, trend, maxVal, isTrae, granularity) {
    const W = 480, H = 160, P = 24;
    const max = maxVal || 1;
    const stepX = (W - P * 2) / (trend.length - 1);
    
    function y(v) {
      return H - P - (v / max) * (H - P * 2);
    }

    // 根据粒度决定显示多少个 X 轴标签
    let labelStep;
    if (granularity === 'minute') {
      labelStep = Math.ceil(trend.length / 8); // 每3小时一个标签
    } else if (granularity === 'hour') {
      labelStep = Math.ceil(trend.length / 7); // 每天一个标签
    } else {
      labelStep = Math.ceil(trend.length / 6); // 每5天一个标签
    }

    // 生成路径点
    let areaPath = `M ${P},${H - P}`;
    let linePath = '';
    let circles = '';
    let labels = '';

    for (let i = 0; i < trend.length; i++) {
      const x = (P + i * stepX).toFixed(1);
      const yVal = y(trend[i].value).toFixed(1);
      areaPath += ` L ${x},${yVal}`;
      linePath += `${x},${yVal} `;
      
      // 数据点（对于分钟级数据，只显示部分点以避免过于拥挤）
      if (granularity !== 'minute' || i % 30 === 0) {
        circles += `<circle cx="${x}" cy="${yVal}" r="2" fill="#0969da" />`;
      }
      
      // X轴标签
      if (i % labelStep === 0) {
        labels += `<text x="${x}" y="${H - 6}" font-size="9" fill="#57606a" text-anchor="middle">${trend[i].label}</text>`;
      }
    }
    areaPath += ` L ${(P + (trend.length - 1) * stepX).toFixed(1)},${H - P} Z`;

    const svg = `
      <svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
        <!-- Grid lines -->
        <line x1="${P}" y1="${P}" x2="${P}" y2="${H - P}" stroke="#eaeef2" stroke-width="1" />
        <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#eaeef2" stroke-width="1" />
        
        <!-- Area fill -->
        <path fill="rgba(9, 105, 218, 0.1)" d="${areaPath}" />
        
        <!-- Line -->
        <polyline fill="none" stroke="#0969da" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${linePath.trim()}" />
        
        <!-- Data points -->
        ${circles}
        
        <!-- X-axis labels -->
        ${labels}
      </svg>
    `;

    container.innerHTML = svg;
  }

  // 渲染空状态
  function renderEmptyState(container) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#d0d7de" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
        <p style="margin-top: 8px; font-size: 13px; color: #57606a;">No trend data</p>
      </div>
    `;
  }

  // 加载趋势数据
  async function loadTrendData(apiKey, granularity) {
    const container = document.querySelector(`.trend-chart-container[data-key="${apiKey}"]`);
    const titleEl = document.querySelector(`.trend-title[data-key="${apiKey}"]`);
    
    if (!container) return;

    const isTrae = container.getAttribute('data-is-trae') === 'true';

    // 添加加载状态
    container.classList.add('loading');

    try {
      const res = await fetch(`${basePath}/api/trend/${encodeURIComponent(apiKey)}?granularity=${granularity}`);
      if (!res.ok) {
        throw new Error('Failed to load trend data');
      }

      const data = await res.json();

      // 更新标题
      if (titleEl) {
        titleEl.textContent = granularityTitles[granularity] || granularityTitles.day;
      }

      // 渲染图表
      if (data.trend && data.trend.length > 0) {
        renderTrendChart(container, data.trend, data.maxVal, isTrae, granularity);
      } else {
        renderEmptyState(container);
      }
    } catch (err) {
      console.error('Failed to load trend data:', err);
      renderEmptyState(container);
    } finally {
      container.classList.remove('loading');
    }
  }

  // 绑定粒度切换按钮事件
  document.querySelectorAll('.granularity-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const apiKey = btn.getAttribute('data-key');
      const granularity = btn.getAttribute('data-granularity');
      
      // 更新按钮状态
      const selector = btn.closest('.granularity-selector');
      selector.querySelectorAll('.granularity-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 禁用按钮防止重复点击
      selector.querySelectorAll('.granularity-btn').forEach(b => b.disabled = true);

      // 加载数据
      await loadTrendData(apiKey, granularity);

      // 重新启用按钮
      selector.querySelectorAll('.granularity-btn').forEach(b => b.disabled = false);
    });
  });
});
