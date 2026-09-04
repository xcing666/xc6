/* =============================================
   禁用移动端页面缩放（双击 / 双指）
   说明：iOS Safari 10+ 会忽略 user-scalable=no，
        本脚本作为 CSS touch-action 的兜底补充。
   注意：图片查看器等自定义手势区域已单独设置
         touch-action:none，不受本脚本影响。
   ============================================= */
(function () {
  'use strict';

  // 1) iOS Safari 双指捏合（gesturestart/change/end 为 WebKit 私有事件）
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      e.preventDefault();
    }, { passive: false });
  });

  // 2) 多指触摸时阻止缩放（覆盖 Android 及未触发 gesture 事件的场景）
  document.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  // 3) 双击（300ms 内两次 touchend）阻止缩放
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouchEnd <= 300) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  // 4) 兜底：Ctrl/⌘ + 滚轮 缩放（部分安卓浏览器/桌面模拟移动端）
  document.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }, { passive: false });
})();
