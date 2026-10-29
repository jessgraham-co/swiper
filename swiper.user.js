// ==UserScript==
// @name        Swiper
// @description Tinder-style Instagram unfollow tool
// @match       https://www.instagram.com/*
// @run-at      document-start
// @inject-into content
// @grant       none
// ==/UserScript==

function swiperInit(){
  if(window.__swiper_running){return;}
  window.__swiper_running = true;  var following = [];
  var cursor = null;
  var hasMore = true;
  var currentIdx = 0;
  var stats = {kept:0, cut:0};
  var history = [];
  var userId = null;
  var lastUnfollowTime = Date.now();
  var DELAY_MS = 1500;
  var unfollowQueue = [];
  var processingQueue = false;
  var isSorted = false;
  var totalFollowing = null;

  // -- Persistence --
  var STORAGE_KEY = '__swiper_decisions';
  var decisions = {}; // {username: 'kept' | 'cut'}

  function loadDecisions(){
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if(saved) decisions = JSON.parse(saved);
    } catch(e){ decisions = {}; }
  }

  function saveDecision(username, action){
    decisions[username] = action;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions)); } catch(e){}
  }

  function removeDecision(username){
    delete decisions[username];
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions)); } catch(e){}
  }

  function clearDecisions(){
    decisions = {};
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
  }

  function alreadyDecided(username){
    return !!decisions[username];
  }

  loadDecisions();
  var savedCount = Object.keys(decisions).length;

  var style = document.createElement('style');
  style.textContent = '@import url("https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&display=swap"); @keyframes __sw_spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);

  var overlay = document.createElement('div');
  overlay.id = '__sw_overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0a0a0f;display:flex;flex-direction:column;font-family:Syne,sans-serif;overflow:hidden;';

  overlay.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;padding-top:max(16px,env(safe-area-inset-top));border-bottom:1px solid rgba(255,255,255,0.07);background:rgba(10,10,15,0.97);backdrop-filter:blur(12px);flex-shrink:0;">'
    + '<div style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#f0f0f5;">Swipe<span style="color:#ff3e6c;">r</span></div>'
    + '<div style="display:flex;align-items:center;gap:8px;">'
    +   '<button id="__sw_sort" style="background:#1a1a24;border:1px solid rgba(255,255,255,0.07);color:#6b6b80;border-radius:8px;padding:5px 10px;font-size:11px;cursor:pointer;font-family:DM Mono,monospace;">A-Z</button>'
    +   '<button id="__sw_reset" style="background:#1a1a24;border:1px solid rgba(255,255,255,0.07);color:#6b6b80;border-radius:8px;padding:5px 10px;font-size:11px;cursor:pointer;font-family:DM Mono,monospace;">RESET</button>'
    +   '<div id="__sw_stats" style="font-family:\'DM Mono\',monospace;font-size:11px;background:#111118;border:1px solid rgba(255,255,255,0.07);border-radius:20px;padding:5px 12px;display:flex;gap:10px;">'
    +     '<span id="__sw_kept" style="color:#00e5a0;">0 \u2713</span>'
    +     '<span id="__sw_cut" style="color:#ff3e6c;">0 \u2717</span>'
    +     '<span id="__sw_rem" style="color:#6b6b80;">...</span>'
    +   '</div>'
    +   '<button id="__sw_exit" style="background:transparent;border:1px solid rgba(255,255,255,0.1);color:#6b6b80;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer;">\u2715</button>'
    + '</div>'
    + '</div>'
    + '<div id="__sw_followbar" style="display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 20px;border-bottom:1px solid rgba(255,255,255,0.04);background:#0d0d14;flex-shrink:0;">'
    +   '<span style="font-family:DM Mono,monospace;font-size:11px;color:#6b6b80;">FOLLOWING</span>'
    +   '<span id="__sw_total" style="font-family:DM Mono,monospace;font-size:22px;font-weight:700;color:#f0f0f5;letter-spacing:-1px;">...</span>'
    +   '<span id="__sw_delta" style="font-family:DM Mono,monospace;font-size:11px;color:#ff3e6c;min-width:40px;"></span>'
    + '</div>'
    + '<div id="__sw_ratewarn" style="display:none;background:rgba(255,62,108,0.06);border:1px solid rgba(255,62,108,0.2);border-radius:10px;padding:9px 14px;font-family:\'DM Mono\',monospace;font-size:11px;color:rgba(255,62,108,0.9);text-align:center;margin:8px 16px 0;flex-shrink:0;"></div>'
    + '<div id="__sw_cardarea" style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;padding:16px 16px 0;"></div>'
    + '<div style="display:flex;justify-content:center;align-items:center;gap:24px;padding:16px 24px;padding-bottom:max(20px,env(safe-area-inset-bottom));flex-shrink:0;">'
    +   '<button id="__sw_undo" style="width:48px;height:48px;border-radius:50%;background:#1a1a24;border:1px solid rgba(255,255,255,0.07);font-size:18px;cursor:pointer;color:white;display:flex;align-items:center;justify-content:center;">\u21a9</button>'
    +   '<button id="__sw_btn_unfollow" style="width:64px;height:64px;border-radius:50%;background:#ff3e6c;border:none;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(255,62,108,0.4);">\u2717</button>'
    +   '<button id="__sw_btn_keep" style="width:64px;height:64px;border-radius:50%;background:#00e5a0;border:none;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(0,229,160,0.3);">\u2713</button>'
    + '</div>';

  document.body.appendChild(overlay);

  document.getElementById('__sw_exit').onclick = function(){ overlay.remove(); window.__swiper_running = false; };
  document.getElementById('__sw_undo').onclick = function(){ doUndo(); };
  document.getElementById('__sw_btn_unfollow').onclick = function(){ triggerSwipe('left'); };
  document.getElementById('__sw_btn_keep').onclick = function(){ triggerSwipe('right'); };
  document.getElementById('__sw_reset').onclick = function(){
    if(!confirm('Reset all saved progress? You will see all accounts again from the start.')) return;
    clearDecisions();
    currentIdx = 0;
    following = [];
    cursor = null;
    hasMore = true;
    history = [];
    stats = {kept:0, cut:0};
    fetchFollowing();
  };
  document.getElementById('__sw_sort').onclick = function(){
    if(isSorted){
      // Turn off sort, go back to default order
      isSorted = false;
      var btn = document.getElementById('__sw_sort');
      btn.textContent = 'A-Z';
      btn.style.color = '#6b6b80';
      btn.style.borderColor = 'rgba(255,255,255,0.07)';
      currentIdx = 0;
      history = [];
      following = [];
      cursor = null;
      hasMore = true;
      fetchFollowing();
    } else {
      // Load ALL following first, then sort
      isSorted = true;
      var btn = document.getElementById('__sw_sort');
      btn.textContent = 'Loading...';
      btn.style.color = '#f59e0b';
      btn.style.borderColor = 'rgba(245,158,11,0.3)';
      btn.disabled = true;
      following = [];
      cursor = null;
      hasMore = true;
      currentIdx = 0;
      history = [];
      fetchAllFollowing();
    }
  };

  showLoading('Finding your account...');
  fetchUserId();

  function showLoading(msg, loaded, total){
    var pct = (total && loaded) ? Math.min(Math.round((loaded/total)*100), 99) : 0;
    var barWidth = total ? pct+'%' : '0%';
    var countLine = loaded !== undefined
      ? '<div style="font-size:11px;color:#6b6b80;margin-top:2px;">' + loaded.toLocaleString() + (total ? ' / ' + total.toLocaleString() : '') + ' accounts</div>'
      : '';
    var barLine = total
      ? '<div style="width:180px;height:3px;background:rgba(255,255,255,0.07);border-radius:2px;margin-top:12px;overflow:hidden;">'
        + '<div style="height:100%;width:'+barWidth+';background:#ff3e6c;border-radius:2px;transition:width 0.3s ease;"></div>'
        + '</div>'
        + '<div style="font-size:10px;color:#6b6b80;margin-top:6px;font-family:DM Mono,monospace;">'+pct+'%</div>'
      : '';
    document.getElementById('__sw_cardarea').innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:#6b6b80;font-family:DM Mono,monospace;font-size:12px;text-align:center;padding:24px;">'
      + '<div style="width:36px;height:36px;border:3px solid rgba(255,255,255,0.07);border-top-color:#ff3e6c;border-radius:50%;animation:__sw_spin 0.8s linear infinite;margin-bottom:4px;"></div>'
      + '<div style="color:#f0f0f5;font-size:13px;font-weight:600;">' + msg + '</div>'
      + countLine
      + barLine
      + '</div>';
  }

  function showError(msg){
    document.getElementById('__sw_cardarea').innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;color:#ff3e6c;font-family:\'DM Mono\',monospace;font-size:12px;text-align:center;padding:24px;">'
      + '<div style="font-size:32px;">\u26a0</div><div>' + esc(msg) + '</div>'
      + '<div style="color:#6b6b80;font-size:11px;">Make sure you\'re on instagram.com and logged in.</div></div>';
  }

  function getCsrf(){
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : '';
  }

  function fetchUserId(){
    showLoading('Finding your account...');

    // Method 1: dig through window.__additionalDataLoaded or similar React globals
    try {
      var igData = window.__additionalDataLoaded || window.__initialDataLoaded;
      if(igData) {
        var str = JSON.stringify(igData);
        var m = str.match(/"pk":"(\d+)"/);
        if(m){ userId = m[1]; startSession(); return; }
      }
    } catch(e){}

    // Method 2: scan all inline <script> tags for "viewer_id" or "ds_user_id"
    try {
      var scripts = document.querySelectorAll('script');
      for(var i=0;i<scripts.length;i++){
        var t = scripts[i].textContent || '';
        var m1 = t.match(/"viewer_id"\s*:\s*"(\d+)"/);
        var m2 = t.match(/\\"viewer_id\\":\\"(\d+)\\"/);
        var m3 = t.match(/"ds_user_id"\s*:\s*"(\d+)"/);
        var m4 = t.match(/\\"ds_user_id\\":\\"(\d+)\\"/);
        var found = (m1&&m1[1])||(m2&&m2[1])||(m3&&m3[1])||(m4&&m4[1]);
        if(found){ userId = found; startSession(); return; }
      }
    } catch(e){}

    // Method 3: read ds_user_id from cookies directly
    try {
      var cookieMatch = document.cookie.match(/ds_user_id=(\d+)/);
      if(cookieMatch){ userId = cookieMatch[1]; startSession(); return; }
    } catch(e){}

    // Method 4: hit the /api/v1/accounts/current_user/ endpoint
    fetch('https://www.instagram.com/api/v1/accounts/current_user/?edit=true', {
      credentials:'include',
      headers:{
        'X-CSRFToken':getCsrf(),
        'X-IG-App-ID':'936619743392459',
        'X-Requested-With':'XMLHttpRequest',
        'Accept':'*/*'
      }
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      userId = d.user && (d.user.pk || d.user.id || d.user.pk_id);
      if(!userId) throw new Error('no id');
      startSession();
    })
    .catch(function(){
      // Method 5: try the graphql whoami endpoint
      fetch('https://www.instagram.com/api/graphql', {
        method:'POST',
        credentials:'include',
        headers:{
          'X-CSRFToken':getCsrf(),
          'X-IG-App-ID':'936619743392459',
          'X-Requested-With':'XMLHttpRequest',
          'Content-Type':'application/x-www-form-urlencoded'
        },
        body:'av=0&__d=www&__user=0&__a=1&__req=1&__hs=&dpr=3&__ccg=UNKNOWN&__rev=&__s=&__hsi=&__dyn=&__csr=&__comet_req=7&lsd=&jazoest=&__spin_r=&__spin_b=&__spin_t=&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=PolarisProfilePageContentQuery&variables=%7B%7D&server_timestamps=true&doc_id=7919173448064860'
      })
      .then(function(r){ return r.json(); })
      .then(function(d){
        var uid = d && d.data && d.data.xdt_api__v1__accounts__current_user__get && d.data.xdt_api__v1__accounts__current_user__get.user && d.data.xdt_api__v1__accounts__current_user__get.user.pk;
        if(uid){ userId = uid; startSession(); return; }
        throw new Error('no id from graphql');
      })
      .catch(function(){
        // Method 6: look for the user id in the page URL if on a profile page
        try {
          var urlMatch = window.location.pathname.match(/^\/([^\/]+)\/?$/);
          if(urlMatch && urlMatch[1] && urlMatch[1] !== '' && urlMatch[1] !== 'accounts'){
            var username = urlMatch[1];
            fetch('https://www.instagram.com/api/v1/users/web_profile_info/?username='+username, {
              credentials:'include',
              headers:{'X-CSRFToken':getCsrf(),'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'}
            })
            .then(function(r){ return r.json(); })
            .then(function(d){
              var u = d.data && d.data.user;
              if(u && u.id){ userId = u.id; startSession(); return; }
              showError('Logged in but could not get user ID. Try visiting instagram.com/YOUR_USERNAME directly.');
            })
            .catch(function(){ showError('Could not get user ID. Make sure you are logged in to instagram.com.'); });
            return;
          }
        } catch(e){}
        showError('Could not get user ID. Please navigate to instagram.com/YOUR_USERNAME and try again.');
      });
    });
  }

  function startSession(){
    // Fetch the user's total following count from their profile
    fetch('https://www.instagram.com/api/v1/friendships/'+userId+'/following/?count=1', {
      credentials:'include',
      headers:{'X-CSRFToken':getCsrf(),'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'}
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      // try to get total count from user info endpoint
      return fetch('https://www.instagram.com/api/v1/users/'+userId+'/info/', {
        credentials:'include',
        headers:{'X-CSRFToken':getCsrf(),'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'}
      });
    })
    .then(function(r){ return r.json(); })
    .then(function(d){
      var u = d.user;
      if(u && u.following_count){ totalFollowing = u.following_count; }
      else if(u && u.friendship_counts){ totalFollowing = u.friendship_counts.following; }
      updateTotalCounter();
    })
    .catch(function(){})
    .finally(function(){ fetchFollowing(); });
  }

  function updateTotalCounter(){
    var el = document.getElementById('__sw_total');
    var deltaEl = document.getElementById('__sw_delta');
    if(!el) return;
    if(totalFollowing !== null){
      var current = totalFollowing - stats.cut;
      el.textContent = current.toLocaleString();
      if(stats.cut > 0){
        deltaEl.textContent = '-' + stats.cut;
      }
    } else {
      el.textContent = '...';
    }
  }

  function fetchAllFollowing(){
    var total = totalFollowing || null;
    showLoading('Loading all accounts...', following.length, total);
    var url = 'https://www.instagram.com/api/v1/friendships/' + userId + '/following/?count=50' + (cursor ? '&max_id='+cursor : '');
    fetch(url, {
      credentials:'include',
      headers:{'X-CSRFToken':getCsrf(),'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'}
    })
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){
      following = following.concat(d.users || []);
      cursor = d.next_max_id || null;
      hasMore = !!cursor;
      if(hasMore){
        // Keep fetching -- small delay to avoid rate limiting
        setTimeout(fetchAllFollowing, 300);
      } else {
        // All loaded -- now sort and render
        following.sort(function(a,b){ return (a.username||'').localeCompare(b.username||''); });
        var btn = document.getElementById('__sw_sort');
        btn.textContent = 'A-Z ON';
        btn.style.color = '#00e5a0';
        btn.style.borderColor = 'rgba(0,229,160,0.3)';
        btn.disabled = false;
        currentIdx = 0;
        updateStats();
        renderCurrent();
      }
    })
    .catch(function(e){
      // On error, work with what we have
      following.sort(function(a,b){ return (a.username||'').localeCompare(b.username||''); });
      var btn = document.getElementById('__sw_sort');
      btn.textContent = 'A-Z ON';
      btn.style.color = '#00e5a0';
      btn.style.borderColor = 'rgba(0,229,160,0.3)';
      btn.disabled = false;
      if(following.length > 0){ updateStats(); renderCurrent(); }
      else { showError('Failed to load following list: ' + e.message); }
    });
  }

  function fetchFollowing(){
    if(!hasMore){ renderCurrent(); return; }
    showLoading('Loading accounts...', following.length, totalFollowing || null);
    var url = 'https://www.instagram.com/api/v1/friendships/' + userId + '/following/?count=50' + (cursor ? '&max_id='+cursor : '');
    fetch(url, {
      credentials:'include',
      headers:{'X-CSRFToken':getCsrf(),'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'}
    })
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){
      following = following.concat(d.users || []);
      cursor = d.next_max_id || null;
      hasMore = !!cursor;
      updateStats();
      renderCurrent();
    })
    .catch(function(e){
      if(following.length > 0){ renderCurrent(); }
      else { showError('Failed to load following list: ' + e.message); }
    });
  }

  function renderCurrent(){
    var area = document.getElementById('__sw_cardarea');

    // Skip users already decided in a previous session
    while(currentIdx < following.length && alreadyDecided(following[currentIdx].username)){
      currentIdx++;
    }

    if(currentIdx >= following.length){
      if(hasMore){ fetchFollowing(); return; }
      area.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:12px;color:#6b6b80;font-family:\'DM Mono\',monospace;font-size:13px;text-align:center;"><div style="font-size:52px;margin-bottom:4px;">\uD83C\uDF89</div><div style="color:#f0f0f5;font-size:16px;font-weight:700;">All done!</div><div>Unfollowed '+stats.cut+' \u00b7 Kept '+stats.kept+'</div></div>';
      return;
    }
    area.innerHTML = '';

    // Find next undecided user for the background card
    var nextIdx = currentIdx + 1;
    while(nextIdx < following.length && alreadyDecided(following[nextIdx].username)){
      nextIdx++;
    }
    if(nextIdx < following.length){
      area.appendChild(buildCard(following[nextIdx], false));
    }

    var top = buildCard(following[currentIdx], true);
    area.appendChild(top);
    addSwipeListeners(top);
  }

  function buildCard(user, isTop){
    var card = document.createElement('div');
    card.setAttribute('data-username', user.username);
    card.setAttribute('data-pk', user.pk || user.id || '');
    card.style.cssText = 'position:absolute;width:calc(100% - 32px);max-width:380px;'
      + 'background:#16161f;border:1px solid rgba(255,255,255,0.07);border-radius:20px;'
      + 'overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.5);'
      + (isTop ? 'z-index:2;cursor:grab;touch-action:none;user-select:none;' : 'z-index:1;transform:scale(0.94) translateY(16px);pointer-events:none;');

    var fullname = (user.full_name || '').trim();
    var bio = user.biography || user.bio || '';
    var avatar = user.profile_pic_url || '';
    var initials = (user.username || '?')[0].toUpperCase();
    var followersStr = user.follower_count
      ? (user.follower_count >= 1000000 ? (user.follower_count/1000000).toFixed(1)+'M'
        : user.follower_count >= 1000 ? (user.follower_count/1000).toFixed(1)+'K'
        : user.follower_count) + ' followers'
      : '';

    var mediaHTML = '';
    for(var i=0;i<6;i++){
      mediaHTML += '<div style="aspect-ratio:1;background:#1a1a24;display:flex;align-items:center;justify-content:center;color:#6b6b80;font-size:14px;" class="__sw_imgslot">\uD83D\uDCF7</div>';
    }

    card.innerHTML =
      '<div style="padding:16px;display:flex;gap:12px;align-items:flex-start;">'
      + '<div style="width:54px;height:54px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#1a1a24;border:2px solid rgba(255,255,255,0.07);">'
      + (avatar
          ? '<img src="'+avatar+'" style="width:100%;height:100%;object-fit:cover;" onerror="this.outerHTML=\'<div style=width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#6b6b80;background:#1a1a24>\'+\''+initials+'\'+\'</div>\';">'
          : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#6b6b80;">'+initials+'</div>')
      + '</div>'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-size:16px;font-weight:700;letter-spacing:-0.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f0f0f5;">@'+esc(user.username)+'</div>'
      +   (fullname ? '<div style="font-size:13px;color:#6b6b80;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(fullname)+'</div>' : '')
      +   (followersStr ? '<div class="__sw_followers" style="font-family:\'DM Mono\',monospace;font-size:11px;color:#6b6b80;margin-top:4px;">'+followersStr+'</div>' : '<div class="__sw_followers" style="font-family:\'DM Mono\',monospace;font-size:11px;color:#6b6b80;margin-top:4px;"></div>')
      + '</div>'
      + '</div>'
      + '<div class="__sw_bio" style="padding:0 16px 12px;font-size:13px;color:#9090a8;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:16px;">'+(bio ? esc(bio) : '<span style="color:#3a3a4a;font-family:DM Mono,monospace;font-size:11px;">loading bio...</span>')+'</div>'
      + '<div class="__sw_grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px;">'+mediaHTML+'</div>'
      + '<div style="position:absolute;top:20px;left:16px;padding:5px 14px;border-radius:8px;font-size:20px;font-weight:800;letter-spacing:1px;opacity:0;color:#00e5a0;border:3px solid #00e5a0;transform:rotate(-15deg);text-transform:uppercase;" class="__sw_lbl_keep">KEEP</div>'
      + '<div style="position:absolute;top:20px;right:16px;padding:5px 14px;border-radius:8px;font-size:20px;font-weight:800;letter-spacing:1px;opacity:0;color:#ff3e6c;border:3px solid #ff3e6c;transform:rotate(15deg);text-transform:uppercase;" class="__sw_lbl_cut">BYE</div>';

    setTimeout(function(){ loadDetails(card, user); }, 50);
    return card;
  }

  // -- Profile details (bio, follower count, recent posts) --
  var detailCache = {};
  var detailQueue = [];
  var detailBusy = false;
  var detailPausedUntil = 0;

  function igHeaders(extra){
    var h = {
      'X-CSRFToken': getCsrf(),
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*'
    };
    try {
      var claim = sessionStorage.getItem('www-claim-v2');
      if(claim) h['X-IG-WWW-Claim'] = claim;
    } catch(e){}
    if(extra){ for(var k in extra){ h[k] = extra[k]; } }
    return h;
  }

  function igGet(url){
    return fetch(url, {credentials:'include', headers: igHeaders()}).then(function(r){
      if(!r.ok){
        var err = new Error('HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      return r.json().catch(function(){ throw new Error('bad response'); });
    });
  }

  function showNotice(msg, ms){
    var w = document.getElementById('__sw_ratewarn');
    if(!w) return;
    w.style.display = 'block';
    w.textContent = msg;
    if(ms){ setTimeout(function(){ if(w.textContent === msg) w.style.display = 'none'; }, ms); }
  }

  function fmtCount(n){
    return n >= 1000000 ? (n/1000000).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
  }

  function fetchDetails(user){
    var det = {bio:null, followers:null, imgs:[], isPrivate:false, imgsOk:false, err:null};
    var pk = user.pk || user.id;

    function stageProfile(){
      return igGet('https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(user.username)).then(function(d){
        var u = d && d.data && d.data.user;
        if(!u) throw new Error('empty response');
        det.bio = u.biography || '';
        if(u.edge_followed_by) det.followers = u.edge_followed_by.count;
        det.isPrivate = !!u.is_private;
        var tl = u.edge_owner_to_timeline_media;
        if(tl){
          det.imgsOk = true;
          (tl.edges || []).slice(0,6).forEach(function(e){
            var n = e.node || {};
            var url = n.thumbnail_src || n.display_url;
            if(url) det.imgs.push(url);
          });
        }
        det.err = null;
      });
    }

    function stageInfo(){
      return igGet('https://www.instagram.com/api/v1/users/' + pk + '/info/').then(function(d){
        var u = d && d.user;
        if(!u) throw new Error('empty response');
        det.bio = u.biography || '';
        if(typeof u.follower_count === 'number') det.followers = u.follower_count;
        det.isPrivate = !!u.is_private;
        det.err = null;
      });
    }

    function stageFeed(){
      return igGet('https://www.instagram.com/api/v1/feed/user/' + pk + '/?count=6').then(function(d){
        det.imgsOk = true;
        (d.items || []).slice(0,6).forEach(function(item){
          var m = (item.carousel_media && item.carousel_media[0]) || item;
          var c = m.image_versions2 && m.image_versions2.candidates;
          if(c && c.length) det.imgs.push(c[Math.min(1, c.length-1)].url);
        });
      });
    }

    return stageProfile()
      .catch(function(e1){
        if(e1.status === 429) throw e1;
        det.err = e1.message;
        return stageInfo().catch(function(e2){
          if(e2.status === 429) throw e2;
          det.err = (e2.message === e1.message) ? e1.message : (e1.message + ' / ' + e2.message);
        });
      })
      .then(function(){
        if(det.imgs.length || det.isPrivate) return;
        return stageFeed().catch(function(e3){
          if(e3.status === 429) throw e3;
          if(!det.err) det.err = e3.message;
        });
      })
      .then(function(){ return det; });
  }

  function applyDetails(card, det){
    var bioEl = card.querySelector('.__sw_bio');
    if(bioEl){
      if(det.bio !== null){
        if(det.bio){
          bioEl.textContent = det.bio;
          bioEl.style.color = '#9090a8';
        } else {
          bioEl.innerHTML = '<span style="color:#3a3a4a;font-family:DM Mono,monospace;font-size:11px;">no bio</span>';
        }
      } else {
        bioEl.innerHTML = '<span style="color:#a05060;font-family:DM Mono,monospace;font-size:11px;">bio unavailable (' + esc(det.err || 'error') + ')</span>';
      }
    }
    var metaEl = card.querySelector('.__sw_followers');
    if(metaEl && det.followers !== null && det.followers !== undefined){
      metaEl.textContent = fmtCount(det.followers) + ' followers';
    }
    var grid = card.querySelector('.__sw_grid');
    if(!grid) return;
    if(det.imgs.length){
      var slots = grid.querySelectorAll('.__sw_imgslot');
      det.imgs.slice(0,6).forEach(function(url, i){
        if(!slots[i]) return;
        var img = document.createElement('img');
        img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;display:block;';
        img.onerror = function(){ if(this.parentNode) this.parentNode.textContent = '\uD83D\uDCF7'; };
        img.src = url;
        slots[i].textContent = '';
        slots[i].appendChild(img);
      });
    } else {
      var note = det.isPrivate ? 'Private account' : (det.imgsOk ? 'No posts yet' : '');
      if(note){
        grid.innerHTML = '<div style="grid-column:1 / -1;padding:22px 0;text-align:center;background:#1a1a24;color:#6b6b80;font-family:DM Mono,monospace;font-size:11px;">' + note + '</div>';
      }
    }
  }

  function loadDetails(card, user){
    var cached = detailCache[user.username];
    if(cached){ applyDetails(card, cached); return; }
    detailQueue.push({card:card, user:user});
    pumpDetails();
  }

  function pumpDetails(){
    if(detailBusy || !detailQueue.length) return;
    var wait = detailPausedUntil - Date.now();
    if(wait > 0){ setTimeout(pumpDetails, wait + 50); return; }
    detailBusy = true;
    // newest first: the card on top was queued last and matters most
    var job = detailQueue.pop();
    if(!document.body.contains(job.card)){ detailBusy = false; pumpDetails(); return; }
    var hit = detailCache[job.user.username];
    if(hit){ applyDetails(job.card, hit); detailBusy = false; pumpDetails(); return; }
    fetchDetails(job.user).then(function(det){
      detailCache[job.user.username] = det;
      applyDetails(job.card, det);
    }).catch(function(e){
      if(e && e.status === 429){
        detailPausedUntil = Date.now() + 30000;
        detailQueue.push(job);
        showNotice('Instagram is rate limiting profile lookups -- pausing 30s...', 30000);
      } else {
        applyDetails(job.card, {bio:null, followers:null, imgs:[], isPrivate:false, imgsOk:false, err:(e && e.message) || 'error'});
      }
    }).then(function(){
      setTimeout(function(){ detailBusy = false; pumpDetails(); }, 350);
    });
  }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function addSwipeListeners(card){
    var startX=0, curX=0, dragging=false;
    function start(e){ dragging=true; var p=e.touches?e.touches[0]:e; startX=curX=p.clientX; card.style.transition='none'; }
    function move(e){
      if(!dragging) return; e.preventDefault();
      var p=e.touches?e.touches[0]:e; curX=p.clientX;
      var dx=curX-startX, rot=dx*0.08;
      card.style.transform='translateX('+dx+'px) rotate('+rot+'deg)';
      var pct=Math.abs(dx)/(window.innerWidth*0.28);
      var lk=card.querySelector('.__sw_lbl_keep'), lc=card.querySelector('.__sw_lbl_cut');
      if(dx>0){lk.style.opacity=Math.min(pct,1);lc.style.opacity=0;}
      else{lc.style.opacity=Math.min(pct,1);lk.style.opacity=0;}
    }
    function end(){
      if(!dragging) return; dragging=false;
      var dx=curX-startX, thresh=window.innerWidth*0.25;
      if(Math.abs(dx)>thresh){ doSwipe(card, dx>0?'right':'left'); }
      else{
        card.style.transition='transform 0.3s ease'; card.style.transform='';
        card.querySelector('.__sw_lbl_keep').style.opacity=0;
        card.querySelector('.__sw_lbl_cut').style.opacity=0;
      }
    }
    card.addEventListener('touchstart',start,{passive:true});
    card.addEventListener('touchmove',move,{passive:false});
    card.addEventListener('touchend',end);
    card.addEventListener('mousedown',start);
    document.addEventListener('mousemove',move);
    document.addEventListener('mouseup',function h(){end();document.removeEventListener('mouseup',h);document.removeEventListener('mousemove',move);});
  }

  function triggerSwipe(dir){
    var area=document.getElementById('__sw_cardarea');
    // the top card is always the last card in the area (the background card is added first)
    var cards=area.querySelectorAll('[data-username]');
    var top=cards.length ? cards[cards.length-1] : null;
    if(top) doSwipe(top,dir);
  }

  function doSwipe(card, dir){
    var username=card.getAttribute('data-username'), pk=card.getAttribute('data-pk');
    history.push({idx:currentIdx,action:dir,username:username,pk:pk});
    saveDecision(username, dir === 'left' ? 'cut' : 'kept');
    if(dir==='left'){
      stats.cut++;
      updateTotalCounter();
      card.style.transition='transform 0.35s ease-in,opacity 0.35s ease-in';
      card.style.transform='translateX(-130%) rotate(-25deg)'; card.style.opacity='0';
      queueUnfollow(pk, username);
    } else {
      stats.kept++;
      card.style.transition='transform 0.35s ease-in,opacity 0.35s ease-in';
      card.style.transform='translateX(130%) rotate(25deg)'; card.style.opacity='0';
    }
    var area=document.getElementById('__sw_cardarea');
    var next=area.querySelector('[style*="scale(0.94)"]');
    if(next){
      setTimeout(function(){
        next.style.transition='transform 0.35s ease-out';
        next.style.transform='scale(1) translateY(0)';
        next.style.removeProperty('pointer-events');
        next.style.zIndex='2';
        addSwipeListeners(next);
      }, 50);
    }
    currentIdx++; updateStats();
    setTimeout(function(){
      card.remove();
      if(currentIdx >= following.length){
        if(hasMore) fetchFollowing();
        else area.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;gap:12px;color:#6b6b80;font-family:\'DM Mono\',monospace;font-size:13px;text-align:center;"><div style="font-size:52px;">\uD83C\uDF89</div><div style="color:#f0f0f5;font-size:16px;font-weight:700;">All done!</div><div>Unfollowed '+stats.cut+' \u00b7 Kept '+stats.kept+'</div></div>';
      } else {
        renderCurrent();
      }
    }, 380);
  }

  function doUndo(){
    if(!history.length) return;
    var last=history.pop();
    removeDecision(last.username);
    if(last.action==='left'){
      stats.cut=Math.max(0,stats.cut-1);
      updateTotalCounter();
      fetch('https://www.instagram.com/api/v1/friendships/create/'+last.pk+'/', {
        method:'POST', credentials:'include',
        headers:{'X-CSRFToken':getCsrf(),'X-IG-App-ID':'936619743392459','Content-Type':'application/x-www-form-urlencoded','X-Requested-With':'XMLHttpRequest'},
        body:'user_id='+last.pk
      }).catch(function(){});
    } else {
      stats.kept=Math.max(0,stats.kept-1);
    }
    currentIdx=last.idx; updateStats(); renderCurrent();
  }

  var unfollowFailStreak = 0;
  var unfollowHalted = false;

  function unfollowFailed(item, e){
    // The unfollow did not go through: forget the decision so this account shows up again
    removeDecision(item.username);
    stats.cut = Math.max(0, stats.cut - 1);
    updateTotalCounter();
    updateStats();
    unfollowFailStreak++;
    var why = (e && e.message) || 'error';
    if(unfollowFailStreak >= 3 && !unfollowHalted){
      unfollowHalted = true;
      while(unfollowQueue.length){ removeDecision(unfollowQueue.shift().username); stats.cut = Math.max(0, stats.cut - 1); }
      updateStats();
      showNotice('Unfollows are FAILING (' + why + '). Stopped. Close Swiper and check Instagram. Nothing was saved as unfollowed.');
    } else if(!unfollowHalted){
      showNotice('Could not unfollow @' + item.username + ' (' + why + ').', 8000);
    }
  }

  function queueUnfollow(pk, username){
    if(unfollowHalted){ unfollowFailed({pk:pk, username:username}, new Error('stopped after repeated failures')); return; }
    unfollowQueue.push({pk:pk,username:username});
    if(!processingQueue) processQueue();
  }

  function processQueue(){
    if(!unfollowQueue.length){ processingQueue=false; return; }
    processingQueue=true;
    var item=unfollowQueue.shift();
    var delay=Math.max(0, DELAY_MS-(Date.now()-lastUnfollowTime));

    // Every 50 unfollows, pause 30 seconds
    if(stats.cut>0 && stats.cut%50===0){
      var warn=document.getElementById('__sw_ratewarn');
      warn.style.display='block';
      warn.textContent='\u26a0 '+stats.cut+' unfollows done -- pausing 30s to protect your account...';
      delay=30000;
      setTimeout(function(){ warn.style.display='none'; }, 30000);
    }

    setTimeout(function(){
      lastUnfollowTime=Date.now();
      fetch('https://www.instagram.com/api/v1/friendships/destroy/'+item.pk+'/', {
        method:'POST', credentials:'include',
        headers: igHeaders({'Content-Type':'application/x-www-form-urlencoded'}),
        body:'user_id='+item.pk
      }).then(function(r){
        if(!r.ok){ throw new Error('HTTP ' + r.status); }
        return r.json().catch(function(){ return {}; });
      }).then(function(d){
        if(d && d.status && d.status !== 'ok'){ throw new Error(d.message || d.status); }
        unfollowFailStreak = 0;
      }).catch(function(e){
        unfollowFailed(item, e);
      }).then(function(){ processQueue(); });
    }, delay);
  }

  function updateStats(){
    var k=document.getElementById('__sw_kept'),c=document.getElementById('__sw_cut'),r=document.getElementById('__sw_rem');
    if(k) k.textContent=stats.kept+' \u2713';
    if(c) c.textContent=stats.cut+' \u2717';
    if(r) r.textContent=(following.length-currentIdx)+' left';
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', swiperInit);
} else {
  swiperInit();
}
