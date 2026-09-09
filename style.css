/* =========================================================
   GitView — script.js
   GitHub REST API profile explorer. Vanilla JS, no frameworks.
   ========================================================= */

const API_BASE = 'https://api.github.com';

/* ---------- state ---------- */
const state = {
  currentUser: null,       // raw /users/{username} response
  repos: [],                // raw /users/{username}/repos response
  visibleRepoCount: 12,
  repoPageSize: 12,
  repoSort: 'updated',
  repoFilter: '',
  favorites: loadJSON('gitview:favorites', []),
  history: loadJSON('gitview:history', []),
  userCache: {}             // username(lowercase) -> {user, repos, ts}
};

/* ---------- DOM refs ---------- */
const el = {};
[
  'nav','navLinks','hamburger','themeToggle','iconMoon','iconSun',
  'searchForm','usernameInput','searchError','heroSection',
  'recentStrip','recentChips',
  'results','skeletonWrap','profileCard','statsGrid','insightsSection','reposSection','errorState',
  'pAvatar','pName','pLogin','pBio','pMeta','viewGithubBtn','favBtn','favIcon','favLabel','copyLinkBtn',
  'statRepos','statFollowers','statFollowing','statGists',
  'langBars','langEmpty','insightsList',
  'repoCountPill','repoFilterInput','repoSort','repoGrid','repoEmpty','loadMoreBtn',
  'errorTitle','errorBody',
  'favCount','favoritesGrid','favEmptyNote',
  'historyList','historyEmptyNote','clearHistoryBtn',
  'compareForm','compareUserA','compareUserB','compareError','compareSkel','compareResult',
  'backToTop','toast','main'
].forEach(id => { el[id] = document.getElementById(id); });

const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
  'C++': '#f34b7d', C: '#555555', 'C#': '#178600', PHP: '#4F5D95', Ruby: '#701516',
  Go: '#00ADD8', Rust: '#dea584', Swift: '#F05138', Kotlin: '#A97BFF', HTML: '#e34c26',
  CSS: '#563d7c', Shell: '#89e051', Vue: '#41b883', Dart: '#00B4AB', Scala: '#c22d40',
  Elixir: '#6e4a7e', Haskell: '#5e5086', Lua: '#000080', Perl: '#0298c3', R: '#198CE7',
  ObjectiveC: '#438eff', Jupyter: '#DA5B0B'
};
function langColor(name){ return LANGUAGE_COLORS[name] || '#8B92A3'; }

/* =========================================================
   Utilities
   ========================================================= */
function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ return fallback; }
}
function saveJSON(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); }
  catch(e){ /* storage unavailable — fail silently, app still works */ }
}
function formatNumber(n){
  if(n === null || n === undefined || Number.isNaN(n)) return '0';
  if(n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if(n >= 1000) return (n/1000).toFixed(1).replace(/\.0$/,'') + 'K';
  return n.toLocaleString('en-US');
}
function timeAgo(dateStr){
  if(!dateStr) return '';
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff/60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return `${mins} minute${mins===1?'':'s'} ago`;
  const hrs = Math.floor(mins/60);
  if(hrs < 24) return `${hrs} hour${hrs===1?'':'s'} ago`;
  const days = Math.floor(hrs/24);
  if(days < 30) return `${days} day${days===1?'':'s'} ago`;
  const months = Math.floor(days/30);
  if(months < 12) return `${months} month${months===1?'':'s'} ago`;
  const years = Math.floor(months/12);
  return `${years} year${years===1?'':'s'} ago`;
}
function formatJoinDate(dateStr){
  if(!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function escapeHTML(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
function showToast(msg){
  el.toast.textContent = msg;
  el.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.remove('show'), 2200);
}
function isValidUsername(u){
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(u);
}

/* =========================================================
   GitHub API layer
   ========================================================= */
async function githubFetch(path){
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/vnd.github+json' }
  });

  if(res.status === 403){
    const remaining = res.headers.get('x-ratelimit-remaining');
    if(remaining === '0'){
      const err = new Error('rate_limit');
      err.type = 'rate_limit';
      throw err;
    }
  }
  if(res.status === 404){
    const err = new Error('not_found');
    err.type = 'not_found';
    throw err;
  }
  if(!res.ok){
    const err = new Error('api_error');
    err.type = 'api_error';
    throw err;
  }
  return res.json();
}

async function fetchUser(username){
  return githubFetch(`/users/${encodeURIComponent(username)}`);
}

async function fetchAllRepos(username){
  // GitHub paginates at 100/page max; pull up to 300 repos (3 pages) — plenty for analysis.
  let all = [];
  for(let page = 1; page <= 3; page++){
    const batch = await githubFetch(`/users/${encodeURIComponent(username)}/repos?per_page=100&page=${page}&sort=updated`);
    all = all.concat(batch);
    if(batch.length < 100) break;
  }
  return all;
}

/* =========================================================
   Search flow
   ========================================================= */
async function searchUser(rawUsername, { pushHistory = true, updateUrl = true } = {}){
  const username = (rawUsername || '').trim();
  hideError();

  if(!username){
    showSearchError('Please enter a GitHub username.');
    return;
  }
  if(!isValidUsername(username)){
    showSearchError('That doesn\'t look like a valid GitHub username.');
    return;
  }

  el.usernameInput.value = username;
  el.results.hidden = false;
  el.profileCard.hidden = true;
  el.statsGrid.hidden = true;
  el.insightsSection.hidden = true;
  el.reposSection.hidden = true;
  el.errorState.hidden = true;
  showSkeleton(true);
  el.results.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try{
    const cacheKey = username.toLowerCase();
    let user, repos;
    const cached = state.userCache[cacheKey];

    if(cached && (Date.now() - cached.ts) < 60000){
      user = cached.user;
      repos = cached.repos;
    }else{
      user = await fetchUser(username);
      repos = await fetchAllRepos(username);
      state.userCache[cacheKey] = { user, repos, ts: Date.now() };
    }

    state.currentUser = user;
    state.repos = repos;
    state.visibleRepoCount = state.repoPageSize;
    state.repoFilter = '';
    el.repoFilterInput.value = '';
    state.repoSort = 'updated';
    el.repoSort.value = 'updated';

    displayProfile(user);
    displayStats(user);
    calculateInsights(repos);
    calculateLanguages(repos);
    displayRepositories();

    if(pushHistory) saveHistory(user);
    if(updateUrl) updateProfileUrl(user.login);

  }catch(err){
    showFetchError(err);
  }finally{
    showSkeleton(false);
  }
}

function showSkeleton(on){
  el.skeletonWrap.hidden = !on;
}

function showSearchError(msg){
  el.searchError.textContent = msg;
  el.searchError.hidden = false;
}
function hideError(){
  el.searchError.hidden = true;
}

function showFetchError(err){
  let title = 'Something went wrong';
  let body = 'Please try again in a moment.';

  if(err && err.type === 'not_found'){
    title = 'GitHub user not found';
    body = 'Check the username and try again.';
  }else if(err && err.type === 'rate_limit'){
    title = 'GitHub API rate limit reached';
    body = 'GitHub limits unauthenticated requests. Please wait a bit and try again.';
  }else if(!navigator.onLine){
    title = 'Unable to connect to GitHub';
    body = 'Check your internet connection and try again.';
  }else{
    title = 'Unable to connect to GitHub';
    body = 'Something went wrong while reaching the GitHub API.';
  }

  el.errorTitle.textContent = title;
  el.errorBody.textContent = body;
  el.errorState.hidden = false;
}

/* =========================================================
   Display: profile header
   ========================================================= */
function displayProfile(user){
  el.pAvatar.src = user.avatar_url;
  el.pAvatar.alt = `${user.login}'s avatar`;
  el.pName.textContent = user.name || user.login;
  el.pLogin.textContent = `@${user.login}`;
  el.pLogin.href = user.html_url;

  if(user.bio){
    el.pBio.textContent = user.bio;
    el.pBio.hidden = false;
  }else{
    el.pBio.hidden = true;
  }

  el.pMeta.innerHTML = '';
  const metaItems = [];
  if(user.location) metaItems.push(`<li>📍 ${escapeHTML(user.location)}</li>`);
  if(user.company) metaItems.push(`<li>🏢 ${escapeHTML(user.company)}</li>`);
  if(user.blog) {
    const href = /^https?:\/\//.test(user.blog) ? user.blog : `https://${user.blog}`;
    metaItems.push(`<li>🔗 <a href="${escapeHTML(href)}" target="_blank" rel="noopener">${escapeHTML(user.blog)}</a></li>`);
  }
  if(user.twitter_username) metaItems.push(`<li>🐦 <a href="https://x.com/${escapeHTML(user.twitter_username)}" target="_blank" rel="noopener">@${escapeHTML(user.twitter_username)}</a></li>`);
  if(user.created_at) metaItems.push(`<li>🗓 Joined ${formatJoinDate(user.created_at)}</li>`);
  el.pMeta.innerHTML = metaItems.join('');

  el.viewGithubBtn.href = user.html_url;
  el.profileCard.hidden = false;

  updateFavButton();
}

/* =========================================================
   Display: stats
   ========================================================= */
function displayStats(user){
  el.statRepos.textContent = formatNumber(user.public_repos);
  el.statFollowers.textContent = formatNumber(user.followers);
  el.statFollowing.textContent = formatNumber(user.following);
  el.statGists.textContent = formatNumber(user.public_gists);
  el.statsGrid.hidden = false;
}

/* =========================================================
   Insights (calculated from repo JSON)
   ========================================================= */
function computeRepoInsights(repos){
  const owned = repos.filter(r => !r.fork);
  const totalStars = repos.reduce((sum, r) => sum + (r.stargazers_count || 0), 0);
  const totalForks = repos.reduce((sum, r) => sum + (r.forks_count || 0), 0);
  const totalSizeKB = repos.reduce((sum, r) => sum + (r.size || 0), 0);
  const mostStarred = repos.reduce((best, r) => (!best || (r.stargazers_count||0) > (best.stargazers_count||0)) ? r : best, null);
  const avgStars = repos.length ? (totalStars / repos.length) : 0;

  const langCounts = {};
  repos.forEach(r => { if(r.language) langCounts[r.language] = (langCounts[r.language]||0) + 1; });
  const topLang = Object.entries(langCounts).sort((a,b) => b[1]-a[1])[0];

  return {
    totalStars, totalForks, totalSizeKB, mostStarred, avgStars,
    originalCount: owned.length,
    topLanguage: topLang ? topLang[0] : null
  };
}

function calculateInsights(repos){
  if(!repos || repos.length === 0){
    el.insightsSection.hidden = false;
    el.insightsList.innerHTML = '<p class="empty-note">This user has no public repositories.</p>';
    el.langBars.innerHTML = '';
    el.langEmpty.hidden = false;
    return;
  }

  const insights = computeRepoInsights(repos);
  const sizeDisplay = insights.totalSizeKB > 1024
    ? `${(insights.totalSizeKB/1024).toFixed(1)} MB`
    : `${formatNumber(insights.totalSizeKB)} KB`;

  const rows = [
    ['Total stars received', formatNumber(insights.totalStars)],
    ['Total forks', formatNumber(insights.totalForks)],
    ['Original repositories', formatNumber(insights.originalCount)],
    ['Average stars / repo', insights.avgStars.toFixed(1)],
    ['Combined repo size', sizeDisplay],
  ];
  if(insights.mostStarred && (insights.mostStarred.stargazers_count||0) > 0){
    rows.push(['Most starred repo', `${insights.mostStarred.name} (${formatNumber(insights.mostStarred.stargazers_count)}★)`]);
  }
  if(insights.topLanguage){
    rows.push(['Most-used language', insights.topLanguage]);
  }

  el.insightsList.innerHTML = rows.map(([k,v]) => `
    <div class="kv-row"><dt>${escapeHTML(k)}</dt><dd>${escapeHTML(String(v))}</dd></div>
  `).join('');

  el.insightsSection.hidden = false;
}

function calculateLanguages(repos){
  const counts = {};
  let total = 0;
  repos.forEach(r => {
    if(r.language){
      counts[r.language] = (counts[r.language] || 0) + 1;
      total++;
    }
  });

  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 6);

  if(sorted.length === 0){
    el.langBars.innerHTML = '';
    el.langEmpty.hidden = false;
    return;
  }
  el.langEmpty.hidden = true;

  el.langBars.innerHTML = sorted.map(([name, count]) => {
    const pct = total ? Math.round((count/total)*100) : 0;
    return `
      <div class="lang-row">
        <span class="lang-name">${escapeHTML(name)}</span>
        <div class="lang-track"><div class="lang-fill" style="width:${pct}%; background:${langColor(name)}"></div></div>
        <span class="lang-pct">${pct}%</span>
      </div>
    `;
  }).join('');
}

/* =========================================================
   Repositories: sort / filter / render / pagination
   ========================================================= */
function sortRepositories(repos, sortBy){
  const copy = [...repos];
  switch(sortBy){
    case 'stars': return copy.sort((a,b) => (b.stargazers_count||0) - (a.stargazers_count||0));
    case 'forks': return copy.sort((a,b) => (b.forks_count||0) - (a.forks_count||0));
    case 'name': return copy.sort((a,b) => a.name.localeCompare(b.name));
    case 'updated':
    default: return copy.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
  }
}

function filterRepositories(repos, query){
  if(!query) return repos;
  const q = query.toLowerCase();
  return repos.filter(r =>
    r.name.toLowerCase().includes(q) ||
    (r.description && r.description.toLowerCase().includes(q))
  );
}

function displayRepositories(){
  const filtered = filterRepositories(state.repos, state.repoFilter);
  const sorted = sortRepositories(filtered, state.repoSort);

  el.repoCountPill.textContent = formatNumber(filtered.length);

  if(state.repos.length === 0){
    el.reposSection.hidden = false;
    el.repoGrid.innerHTML = '';
    el.repoEmpty.textContent = 'This user has no public repositories.';
    el.repoEmpty.hidden = false;
    el.loadMoreBtn.hidden = true;
    return;
  }

  if(sorted.length === 0){
    el.repoGrid.innerHTML = '';
    el.repoEmpty.textContent = 'No repositories match your filter.';
    el.repoEmpty.hidden = false;
    el.loadMoreBtn.hidden = true;
    el.reposSection.hidden = false;
    return;
  }

  el.repoEmpty.hidden = true;
  const visible = sorted.slice(0, state.visibleRepoCount);
  el.repoGrid.innerHTML = visible.map(repoCardHTML).join('');
  el.loadMoreBtn.hidden = sorted.length <= visible.length;
  el.reposSection.hidden = false;
}

function repoCardHTML(repo){
  const lang = repo.language;
  const desc = repo.description ? escapeHTML(repo.description) : 'No description provided.';
  return `
    <article class="repo-card" style="border-left-color:${lang ? langColor(lang) : 'var(--border-strong)'}">
      <div class="repo-head">
        <a class="repo-name" href="${repo.html_url}" target="_blank" rel="noopener">${escapeHTML(repo.name)}</a>
        <span class="repo-visibility">${repo.private ? 'Private' : 'Public'}</span>
      </div>
      <p class="repo-desc">${desc}</p>
      <div class="repo-meta">
        ${lang ? `<span><span class="lang-dot" style="background:${langColor(lang)}"></span>${escapeHTML(lang)}</span>` : ''}
        <span>⭐ ${formatNumber(repo.stargazers_count)}</span>
        <span>🍴 ${formatNumber(repo.forks_count)}</span>
        ${repo.open_issues_count ? `<span>◔ ${formatNumber(repo.open_issues_count)} issues</span>` : ''}
      </div>
      <div class="repo-foot">
        <span class="repo-updated">Updated ${timeAgo(repo.updated_at)}</span>
        <a class="repo-link" href="${repo.html_url}" target="_blank" rel="noopener">View repository →</a>
      </div>
    </article>
  `;
}

/* =========================================================
   Favorites
   ========================================================= */
function isFavorite(login){
  return state.favorites.some(f => f.login.toLowerCase() === login.toLowerCase());
}
function saveFavorite(user){
  if(isFavorite(user.login)) return;
  state.favorites.unshift({
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
    followers: user.followers,
    public_repos: user.public_repos,
    html_url: user.html_url
  });
  saveJSON('gitview:favorites', state.favorites);
  renderFavCount();
}
function removeFavorite(login){
  state.favorites = state.favorites.filter(f => f.login.toLowerCase() !== login.toLowerCase());
  saveJSON('gitview:favorites', state.favorites);
  renderFavCount();
  renderFavoritesView();
  if(state.currentUser && state.currentUser.login.toLowerCase() === login.toLowerCase()){
    updateFavButton();
  }
}
function updateFavButton(){
  if(!state.currentUser) return;
  const fav = isFavorite(state.currentUser.login);
  el.favIcon.textContent = fav ? '★' : '☆';
  el.favLabel.textContent = fav ? 'Saved' : 'Add to favorites';
  el.favBtn.classList.toggle('active', fav);
}
function renderFavCount(){
  el.favCount.textContent = state.favorites.length;
}
function renderFavoritesView(){
  if(state.favorites.length === 0){
    el.favoritesGrid.innerHTML = '';
    el.favEmptyNote.hidden = false;
    return;
  }
  el.favEmptyNote.hidden = true;
  el.favoritesGrid.innerHTML = state.favorites.map(f => `
    <article class="fav-card">
      <img class="fav-avatar" src="${f.avatar_url}" alt="${escapeHTML(f.login)}'s avatar">
      <div class="fav-body">
        <p class="fav-name">${escapeHTML(f.name || f.login)}</p>
        <p class="fav-login">@${escapeHTML(f.login)}</p>
        <div class="fav-stats">
          <span>${formatNumber(f.followers)} followers</span>
          <span>${formatNumber(f.public_repos)} repos</span>
        </div>
        <div class="fav-actions">
          <button class="btn btn-primary" data-open-profile="${escapeHTML(f.login)}">Open profile</button>
          <button class="btn btn-ghost" data-remove-fav="${escapeHTML(f.login)}">Remove</button>
        </div>
      </div>
    </article>
  `).join('');
}

/* =========================================================
   History
   ========================================================= */
function saveHistory(user){
  state.history = state.history.filter(h => h.login.toLowerCase() !== user.login.toLowerCase());
  state.history.unshift({ login: user.login, avatar_url: user.avatar_url, ts: Date.now() });
  state.history = state.history.slice(0, 10);
  saveJSON('gitview:history', state.history);
  renderRecentStrip();
}
function clearHistory(){
  state.history = [];
  saveJSON('gitview:history', state.history);
  renderRecentStrip();
  renderHistoryView();
}
function renderRecentStrip(){
  if(state.history.length === 0){
    el.recentStrip.hidden = true;
    return;
  }
  el.recentStrip.hidden = false;
  el.recentChips.innerHTML = state.history.slice(0,6).map(h =>
    `<button class="chip" data-open-profile="${escapeHTML(h.login)}">${escapeHTML(h.login)}</button>`
  ).join('');
}
function renderHistoryView(){
  if(state.history.length === 0){
    el.historyList.innerHTML = '';
    el.historyEmptyNote.hidden = false;
    return;
  }
  el.historyEmptyNote.hidden = true;
  el.historyList.innerHTML = state.history.map(h => `
    <li>
      <button class="history-item" data-open-profile="${escapeHTML(h.login)}">
        <span class="history-user"><img src="${h.avatar_url}" alt="" style="width:28px;height:28px;border-radius:50%"> @${escapeHTML(h.login)}</span>
        <span class="history-time">${timeAgo(new Date(h.ts).toISOString())}</span>
      </button>
    </li>
  `).join('');
}

/* =========================================================
   Compare
   ========================================================= */
async function compareUsers(usernameA, usernameB){
  el.compareError.hidden = true;
  el.compareResult.hidden = true;
  el.compareSkel.hidden = false;

  try{
    const [userA, reposA] = await Promise.all([fetchUser(usernameA), fetchAllRepos(usernameA)]);
    const [userB, reposB] = await Promise.all([fetchUser(usernameB), fetchAllRepos(usernameB)]);

    const insightsA = computeRepoInsights(reposA);
    const insightsB = computeRepoInsights(reposB);

    const rows = [
      ['Followers', formatNumber(userA.followers), formatNumber(userB.followers), userA.followers, userB.followers],
      ['Following', formatNumber(userA.following), formatNumber(userB.following), userA.following, userB.following],
      ['Repositories', formatNumber(userA.public_repos), formatNumber(userB.public_repos), userA.public_repos, userB.public_repos],
      ['Public gists', formatNumber(userA.public_gists), formatNumber(userB.public_gists), userA.public_gists, userB.public_gists],
      ['Total stars', formatNumber(insightsA.totalStars), formatNumber(insightsB.totalStars), insightsA.totalStars, insightsB.totalStars],
      ['Total forks', formatNumber(insightsA.totalForks), formatNumber(insightsB.totalForks), insightsA.totalForks, insightsB.totalForks],
      ['Top language', insightsA.topLanguage || '—', insightsB.topLanguage || '—', null, null],
    ];

    el.compareResult.innerHTML = `
      <table class="compare-table">
        <thead>
          <tr>
            <th></th>
            <th><div class="compare-head"><img src="${userA.avatar_url}" alt=""> @${escapeHTML(userA.login)}</div></th>
            <th><div class="compare-head"><img src="${userB.avatar_url}" alt=""> @${escapeHTML(userB.login)}</div></th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(([label, aDisp, bDisp, aVal, bVal]) => {
            const aWin = aVal !== null && aVal > bVal;
            const bWin = bVal !== null && bVal > aVal;
            return `<tr>
              <th>${escapeHTML(label)}</th>
              <td class="${aWin ? 'compare-win' : ''}">${escapeHTML(String(aDisp))}</td>
              <td class="${bWin ? 'compare-win' : ''}">${escapeHTML(String(bDisp))}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    el.compareResult.hidden = false;
  }catch(err){
    let msg = 'Could not compare these profiles. Check both usernames and try again.';
    if(err && err.type === 'not_found') msg = 'One of these usernames was not found on GitHub.';
    if(err && err.type === 'rate_limit') msg = 'GitHub API rate limit reached. Please try again later.';
    el.compareError.textContent = msg;
    el.compareError.hidden = false;
  }finally{
    el.compareSkel.hidden = true;
  }
}

/* =========================================================
   URL / sharing
   ========================================================= */
function updateProfileUrl(username){
  const url = new URL(window.location.href);
  url.searchParams.set('user', username);
  window.history.replaceState({}, '', url);
}
function copyProfileLink(){
  const url = new URL(window.location.href);
  if(state.currentUser) url.searchParams.set('user', state.currentUser.login);
  navigator.clipboard.writeText(url.toString())
    .then(() => showToast('✓ Link copied!'))
    .catch(() => showToast('Could not copy link'));
}

/* =========================================================
   Theme
   ========================================================= */
function toggleTheme(){
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  setTheme(isLight ? 'dark' : 'light');
}
function setTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('gitview:theme', theme);
  el.iconMoon.hidden = theme === 'light';
  el.iconSun.hidden = theme !== 'light';
}

/* =========================================================
   View / nav routing
   ========================================================= */
const VIEWS = ['explore','favorites','history','compare','about'];
function showView(name){
  VIEWS.forEach(v => {
    const section = document.getElementById(`view-${v}`);
    if(section) section.hidden = (v !== name);
  });
  document.querySelectorAll('.nav-link').forEach(btn => {
    const isActive = btn.dataset.nav === name;
    if(isActive) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  el.navLinks.classList.remove('open');
  el.hamburger.setAttribute('aria-expanded', 'false');
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

  if(name === 'favorites') renderFavoritesView();
  if(name === 'history') renderHistoryView();
}

/* =========================================================
   Event wiring
   ========================================================= */
function init(){
  // theme
  const savedTheme = localStorage.getItem('gitview:theme') ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  setTheme(savedTheme);

  renderFavCount();
  renderRecentStrip();

  // search
  el.searchForm.addEventListener('submit', e => {
    e.preventDefault();
    searchUser(el.usernameInput.value);
  });
  document.querySelectorAll('[data-try]').forEach(btn => {
    btn.addEventListener('click', () => searchUser(btn.dataset.try));
  });

  // repo controls
  let filterDebounce;
  el.repoFilterInput.addEventListener('input', () => {
    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      state.repoFilter = el.repoFilterInput.value.trim();
      state.visibleRepoCount = state.repoPageSize;
      displayRepositories();
    }, 200);
  });
  el.repoSort.addEventListener('change', () => {
    state.repoSort = el.repoSort.value;
    displayRepositories();
  });
  el.loadMoreBtn.addEventListener('click', () => {
    state.visibleRepoCount += state.repoPageSize;
    displayRepositories();
  });

  // favorites / link
  el.favBtn.addEventListener('click', () => {
    if(!state.currentUser) return;
    if(isFavorite(state.currentUser.login)) removeFavorite(state.currentUser.login);
    else { saveFavorite(state.currentUser); updateFavButton(); showToast('Added to favorites'); }
  });
  el.copyLinkBtn.addEventListener('click', copyProfileLink);

  // delegated clicks: open-profile / remove-fav buttons that render dynamically
  document.body.addEventListener('click', e => {
    const openBtn = e.target.closest('[data-open-profile]');
    if(openBtn){
      showView('explore');
      searchUser(openBtn.dataset.openProfile);
      return;
    }
    const removeBtn = e.target.closest('[data-remove-fav]');
    if(removeBtn){
      removeFavorite(removeBtn.dataset.removeFav);
      showToast('Removed from favorites');
      return;
    }
  });

  // history
  el.clearHistoryBtn.addEventListener('click', clearHistory);

  // compare
  el.compareForm.addEventListener('submit', e => {
    e.preventDefault();
    const a = el.compareUserA.value.trim();
    const b = el.compareUserB.value.trim();
    if(!a || !b){
      el.compareError.textContent = 'Enter both usernames to compare.';
      el.compareError.hidden = false;
      return;
    }
    compareUsers(a, b);
  });

  // theme toggle
  el.themeToggle.addEventListener('click', toggleTheme);

  // nav
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.nav));
  });
  el.hamburger.addEventListener('click', () => {
    const open = el.navLinks.classList.toggle('open');
    el.hamburger.setAttribute('aria-expanded', String(open));
  });
  el.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // load profile from URL if present
  const params = new URLSearchParams(window.location.search);
  const userFromUrl = params.get('user');
  if(userFromUrl){
    searchUser(userFromUrl, { updateUrl: false });
  }
}

document.addEventListener('DOMContentLoaded', init);
