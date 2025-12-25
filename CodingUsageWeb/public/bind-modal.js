/**
 * Bind API Key 弹窗逻辑
 * 处理绑定 API Key 的用户交互
 */

(function() {
  const bindBtns = document.querySelectorAll('#bindKeyBtn, #bindKeyBtnEmpty');
  const bindModal = document.getElementById('bindModal');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const cancelBind = document.getElementById('cancelBind');
  const confirmBind = document.getElementById('confirmBind');
  const bindError = document.getElementById('bindError');

  // 从页面获取 basePath（通过全局变量或 data 属性）
  const basePath = window.BASE_PATH || '';

  // 打开弹窗
  bindBtns.forEach(btn => {
    if (btn) {
      btn.addEventListener('click', () => {
        bindModal.classList.add('show');
        apiKeyInput.focus();
      });
    }
  });

  // 关闭弹窗
  function closeModal() {
    bindModal.classList.remove('show');
    apiKeyInput.value = '';
    bindError.classList.remove('show');
  }

  if (cancelBind) {
    cancelBind.addEventListener('click', closeModal);
  }

  if (bindModal) {
    bindModal.addEventListener('click', (e) => {
      if (e.target === bindModal) {
        closeModal();
      }
    });
  }

  // 验证并绑定 API Key
  if (confirmBind) {
    confirmBind.addEventListener('click', async () => {
      const apiKey = apiKeyInput.value.trim();
      
      // 格式验证
      if (!apiKey.startsWith('ck_') || apiKey.length !== 35) {
        bindError.textContent = 'API Key must start with "ck_" and be 35 characters';
        bindError.classList.add('show');
        return;
      }

      // 检查是否已绑定
      if (getBoundApiKeys().includes(apiKey)) {
        bindError.textContent = 'This API Key is already bound';
        bindError.classList.add('show');
        return;
      }

      try {
        // 验证 API Key 是否存在
        const res = await fetch(`${basePath}/validate-key`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey })
        });

        const data = await res.json();

        if (res.ok) {
          // 保存到本地存储
          addBoundApiKey(apiKey);
          // 重定向到首页或刷新
          window.location.href = basePath + '/';
        } else {
          bindError.textContent = data.error || 'Failed to validate API Key';
          bindError.classList.add('show');
        }
      } catch (err) {
        bindError.textContent = 'Network error. Please try again.';
        bindError.classList.add('show');
      }
    });
  }

  // 支持 Enter 键提交
  if (apiKeyInput) {
    apiKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        confirmBind.click();
      }
    });
  }
})();



