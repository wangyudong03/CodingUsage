/**
 * Plaza 页面特有逻辑
 * 处理排序下拉菜单和导航栏更新
 */

(function() {
  const basePath = window.BASE_PATH || '';

  // ==================== 更新导航栏显示 ====================
  function updateNavDisplay() {
    const keys = getBoundApiKeys();
    const navRight = document.querySelector('.nav .right');
    
    // 查找服务端渲染的 My Stats 链接
    let myStatsLink = navRight.querySelector('a[href$="/"]');
    if (!myStatsLink) {
      myStatsLink = Array.from(navRight.querySelectorAll('a')).find(a => a.textContent.includes('My Stats'));
    }
    
    if (keys.length > 0 && !myStatsLink) {
      // 服务端没有渲染链接时，动态添加
      const link = document.createElement('a');
      link.href = basePath + '/';
      link.textContent = `My Stats (${keys.length})`;
      navRight.insertBefore(link, navRight.firstChild);
    } else if (myStatsLink) {
      // 更新已有链接的数量显示
      myStatsLink.textContent = `My Stats (${keys.length})`;
    }
  }
  
  updateNavDisplay();

  // ==================== 排序下拉菜单 ====================
  const sortTrigger = document.getElementById('sortTrigger');
  const sortMenu = document.getElementById('sortMenu');
  const dropdownOverlay = document.getElementById('dropdownOverlay');
  const dropdownItems = document.querySelectorAll('.dropdown-item');

  if (sortTrigger && sortMenu && dropdownOverlay) {
    function toggleMenu() {
      const isShown = sortMenu.classList.contains('show');
      if (isShown) {
        sortMenu.classList.remove('show');
        dropdownOverlay.classList.remove('show');
      } else {
        sortMenu.classList.add('show');
        dropdownOverlay.classList.add('show');
      }
    }

    sortTrigger.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleMenu();
    });

    dropdownOverlay.addEventListener('click', function() {
      toggleMenu();
    });

    dropdownItems.forEach(item => {
      item.addEventListener('click', function() {
        const url = new URL(window.location.href);
        const sort = this.getAttribute('data-sort');
        const order = this.getAttribute('data-order');

        if (sort) {
          url.searchParams.set('sortBy', sort);
        }

        if (order) {
          url.searchParams.set('order', order);
        }

        window.location.href = url.toString();
      });
    });
  }
})();



