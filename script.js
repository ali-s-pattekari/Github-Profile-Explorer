


var API_BASE = "https://api.github.com";
var FETCH_TIMEOUT_MS = 15000;      // give up on a request after 15s
var REPO_PAGE_SIZE = 12;           // how many repo cards to reveal per "Load more"
var CACHE_LIFETIME_MS = 60000;     // reuse a profile fetched in the last 60s

var LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  PHP: "#4F5D95",
  Ruby: "#701516",
  Go: "#00ADD8",
  Rust: "#dea584",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Vue: "#41b883",
  Dart: "#00B4AB",
  Scala: "#c22d40",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  Lua: "#000080",
  Perl: "#0298c3",
  R: "#198CE7"
};

// ---------------------------------------------------------
// App state (one plain object, easy to inspect/debug)
// ---------------------------------------------------------
var state = {
  currentUser: null,     // the profile currently on screen
  repos: [],             // that profile's repositories
  visibleRepoCount: REPO_PAGE_SIZE,
  repoSort: "updated",
  repoFilter: "",
  favorites: [],
  history: [],
  userCache: {},         // "username" -> { user, repos, savedAt }
  requestId: 0           // increases every search; used to ignore old/slow responses
};

// ---------------------------------------------------------
// DOM references — collected once, reused everywhere.
// If an id is missing from the page we simply get "null"
// back and every function checks for that before using it,
// so a markup change can't crash the whole script.
// ---------------------------------------------------------
var el = {};

function collectElements() {
  var ids = [
    "nav", "navLinks", "hamburger", "themeToggle", "iconMoon", "iconSun",
    "searchForm", "usernameInput", "searchError", "heroSection",
    "recentStrip", "recentChips",
    "results", "skeletonWrap", "profileCard", "statsGrid", "insightsSection",
    "reposSection", "errorState",
    "pAvatar", "pName", "pLogin", "pBio", "pMeta", "viewGithubBtn",
    "favBtn", "favIcon", "favLabel", "copyLinkBtn",
    "statRepos", "statFollowers", "statFollowing", "statGists",
    "langBars", "langEmpty", "insightsList",
    "repoCountPill", "repoFilterInput", "repoSort", "repoGrid", "repoEmpty", "loadMoreBtn",
    "errorTitle", "errorBody",
    "favCount", "favoritesGrid", "favEmptyNote",
    "historyList", "historyEmptyNote", "clearHistoryBtn",
    "compareForm", "compareUserA", "compareUserB", "compareError", "compareSkel", "compareResult",
    "backToTop", "toast", "main"
  ];

  for (var i = 0; i < ids.length; i++) {
    el[ids[i]] = document.getElementById(ids[i]);
  }
}

// ---------------------------------------------------------
// Small, self-contained helpers
// ---------------------------------------------------------

// Read a value from localStorage safely. Never throws.
function loadJSON(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    var parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (err) {
    console.warn("Could not read " + key + " from storage:", err);
    return fallback;
  }
}

// Write a value to localStorage safely. Never throws.
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Could not save " + key + " to storage:", err);
  }
}

// Turn 1250 into "1,250" and 12500 into "12.5K".
function formatNumber(n) {
  if (typeof n !== "number" || isNaN(n)) {
    return "0";
  }
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  }
  return n.toLocaleString("en-US");
}

// Turn an ISO date string into "3 days ago".
function timeAgo(dateStr) {
  if (!dateStr) {
    return "";
  }
  var then = new Date(dateStr).getTime();
  if (isNaN(then)) {
    return "";
  }
  var diffMs = Date.now() - then;
  if (diffMs < 0) {
    diffMs = 0;
  }
  var minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return minutes + (minutes === 1 ? " minute ago" : " minutes ago");
  }
  var hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours + (hours === 1 ? " hour ago" : " hours ago");
  }
  var days = Math.floor(hours / 24);
  if (days < 30) {
    return days + (days === 1 ? " day ago" : " days ago");
  }
  var months = Math.floor(days / 30);
  if (months < 12) {
    return months + (months === 1 ? " month ago" : " months ago");
  }
  var years = Math.floor(months / 12);
  return years + (years === 1 ? " year ago" : " years ago");
}

function formatJoinDate(dateStr) {
  if (!dateStr) {
    return "";
  }
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Safely turn any value into text that is allowed inside HTML.
function escapeHTML(value) {
  var text = value === undefined || value === null ? "" : String(value);
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Pick a color for a language name, with a sensible default.
function langColor(name) {
  if (name && LANGUAGE_COLORS[name]) {
    return LANGUAGE_COLORS[name];
  }
  return "#8B92A3";
}

// GitHub usernames: letters, numbers, single hyphens, 1-39 chars.
function isValidUsername(name) {
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(name);
}

function showToast(message) {
  if (!el.toast) {
    return;
  }
  el.toast.textContent = message;
  el.toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(function () {
    el.toast.classList.remove("show");
  }, 2200);
}

function setHidden(node, hidden) {
  if (node) {
    node.hidden = !!hidden;
  }
}

function setText(node, text) {
  if (node) {
    node.textContent = text;
  }
}

// ---------------------------------------------------------
// GitHub API layer
// One function does the actual network call and error
// classification; everything else calls this.
// ---------------------------------------------------------

function githubFetch(path) {
  var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
  var timeoutId = null;

  if (controller) {
    timeoutId = setTimeout(function () {
      controller.abort();
    }, FETCH_TIMEOUT_MS);
  }

  var fetchOptions = { headers: { Accept: "application/vnd.github+json" } };
  if (controller) {
    fetchOptions.signal = controller.signal;
  }

  return fetch(API_BASE + path, fetchOptions)
    .catch(function () {
      // Covers real network failures AND our own timeout abort.
      var err = new Error("network_error");
      err.type = "network_error";
      throw err;
    })
    .then(function (response) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (response.status === 403) {
        var remaining = response.headers.get("x-ratelimit-remaining");
        if (remaining === "0") {
          var rateErr = new Error("rate_limit");
          rateErr.type = "rate_limit";
          throw rateErr;
        }
      }
      if (response.status === 404) {
        var notFoundErr = new Error("not_found");
        notFoundErr.type = "not_found";
        throw notFoundErr;
      }
      if (!response.ok) {
        var apiErr = new Error("api_error");
        apiErr.type = "api_error";
        throw apiErr;
      }
      return response.json();
    });
}

function fetchUser(username) {
  return githubFetch("/users/" + encodeURIComponent(username));
}

// Pull up to 300 repos (3 pages of 100) so stats are based on real data,
// without letting a very large account send hundreds of requests.
function fetchAllRepos(username) {
  var collected = [];

  function loadPage(pageNumber) {
    var path = "/users/" + encodeURIComponent(username) +
      "/repos?per_page=100&page=" + pageNumber + "&sort=updated";

    return githubFetch(path).then(function (batch) {
      collected = collected.concat(batch);
      if (batch.length === 100 && pageNumber < 3) {
        return loadPage(pageNumber + 1);
      }
      return collected;
    });
  }

  return loadPage(1);
}

// ---------------------------------------------------------
// Search flow
// ---------------------------------------------------------

function searchUser(rawUsername, options) {
  options = options || {};
  var pushHistory = options.pushHistory !== false;
  var updateUrl = options.updateUrl !== false;

  var username = (rawUsername || "").trim();
  hideSearchError();

  if (!username) {
    showSearchError("Please enter a GitHub username.");
    return;
  }
  if (!isValidUsername(username)) {
    showSearchError("That doesn't look like a valid GitHub username.");
    return;
  }

  // Every call gets its own ticket. If a newer search starts before this
  // one finishes, its result is ignored instead of overwriting the screen —
  // this is what stops the UI from ever getting stuck half-updated.
  state.requestId = state.requestId + 1;
  var myRequestId = state.requestId;

  if (el.usernameInput) {
    el.usernameInput.value = username;
  }
  setHidden(el.results, false);
  setHidden(el.profileCard, true);
  setHidden(el.statsGrid, true);
  setHidden(el.insightsSection, true);
  setHidden(el.reposSection, true);
  setHidden(el.errorState, true);
  showSkeleton(true);

  if (el.results && el.results.scrollIntoView) {
    el.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  var cacheKey = username.toLowerCase();
  var cached = state.userCache[cacheKey];
  var loadPromise;

  if (cached && (Date.now() - cached.savedAt) < CACHE_LIFETIME_MS) {
    loadPromise = Promise.resolve(cached);
  } else {
    loadPromise = fetchUser(username).then(function (user) {
      if (myRequestId !== state.requestId) {
        return null; // superseded — no point fetching repos for a stale search
      }
      return fetchAllRepos(username).then(function (repos) {
        var result = { user: user, repos: repos, savedAt: Date.now() };
        state.userCache[cacheKey] = result;
        return result;
      });
    });
  }

  loadPromise
    .then(function (result) {
      if (!result || myRequestId !== state.requestId) {
        return; // superseded while we were waiting — do nothing
      }

      state.currentUser = result.user;
      state.repos = result.repos;
      state.visibleRepoCount = REPO_PAGE_SIZE;
      state.repoFilter = "";
      state.repoSort = "updated";
      if (el.repoFilterInput) {
        el.repoFilterInput.value = "";
      }
      if (el.repoSort) {
        el.repoSort.value = "updated";
      }

      displayProfile(result.user);
      displayStats(result.user);
      calculateInsights(result.repos);
      calculateLanguages(result.repos);
      displayRepositories();

      if (pushHistory) {
        saveHistory(result.user);
      }
      if (updateUrl) {
        updateProfileUrl(result.user.login);
      }
    })
    .catch(function (err) {
      if (myRequestId === state.requestId) {
        showFetchError(err);
      }
    })
    .then(function () {
      if (myRequestId === state.requestId) {
        showSkeleton(false);
      }
    });
}

function showSkeleton(on) {
  setHidden(el.skeletonWrap, !on);
}

function showSearchError(message) {
  if (el.searchError) {
    el.searchError.textContent = message;
    el.searchError.hidden = false;
  }
}

function hideSearchError() {
  setHidden(el.searchError, true);
}

function showFetchError(err) {
  var title = "Something went wrong";
  var body = "Please try again in a moment.";
  var type = err && err.type;

  if (type === "not_found") {
    title = "GitHub user not found";
    body = "Check the username and try again.";
  } else if (type === "rate_limit") {
    title = "GitHub API rate limit reached";
    body = "GitHub limits unauthenticated requests. Please wait a bit and try again.";
  } else if (type === "network_error") {
    title = "Unable to connect to GitHub";
    body = navigator.onLine
      ? "The request to GitHub timed out. If you opened this file directly, try running it with a local server instead (see the README)."
      : "Check your internet connection and try again.";
  } else if (navigator.onLine === false) {
    title = "Unable to connect to GitHub";
    body = "Check your internet connection and try again.";
  }

  if (el.errorTitle) {
    el.errorTitle.textContent = title;
  }
  if (el.errorBody) {
    el.errorBody.textContent = body;
  }
  setHidden(el.errorState, false);
}

// ---------------------------------------------------------
// Display: profile header
// ---------------------------------------------------------

function displayProfile(user) {
  if (!user) {
    return;
  }

  if (el.pAvatar) {
    el.pAvatar.src = user.avatar_url || "";
    el.pAvatar.alt = user.login ? (user.login + "'s avatar") : "";
  }
  setText(el.pName, user.name || user.login || "");
  if (el.pLogin) {
    el.pLogin.textContent = "@" + user.login;
    el.pLogin.href = user.html_url || "#";
  }

  if (user.bio) {
    setText(el.pBio, user.bio);
    setHidden(el.pBio, false);
  } else {
    setHidden(el.pBio, true);
  }

  if (el.pMeta) {
    var items = [];

    if (user.location) {
      items.push("<li>\uD83D\uDCCD " + escapeHTML(user.location) + "</li>");
    }
    if (user.company) {
      items.push("<li>\uD83C\uDFE2 " + escapeHTML(user.company) + "</li>");
    }
    if (user.blog) {
      var href = /^https?:\/\//.test(user.blog) ? user.blog : ("https://" + user.blog);
      items.push(
        "<li>\uD83D\uDD17 <a href=\"" + escapeHTML(href) + "\" target=\"_blank\" rel=\"noopener\">" +
        escapeHTML(user.blog) + "</a></li>"
      );
    }
    if (user.twitter_username) {
      items.push(
        "<li>\uD83D\uDC26 <a href=\"https://x.com/" + escapeHTML(user.twitter_username) +
        "\" target=\"_blank\" rel=\"noopener\">@" + escapeHTML(user.twitter_username) + "</a></li>"
      );
    }
    if (user.created_at) {
      items.push("<li>\uD83D\uDDD3 Joined " + formatJoinDate(user.created_at) + "</li>");
    }

    el.pMeta.innerHTML = items.join("");
  }

  if (el.viewGithubBtn) {
    el.viewGithubBtn.href = user.html_url || "#";
  }

  setHidden(el.profileCard, false);
  updateFavoriteButton();
}

// ---------------------------------------------------------
// Display: stat cards
// ---------------------------------------------------------

function displayStats(user) {
  if (!user) {
    return;
  }
  setText(el.statRepos, formatNumber(user.public_repos));
  setText(el.statFollowers, formatNumber(user.followers));
  setText(el.statFollowing, formatNumber(user.following));
  setText(el.statGists, formatNumber(user.public_gists));
  setHidden(el.statsGrid, false);
}

// ---------------------------------------------------------
// Insights — all numbers below are computed from the real
// repository list, nothing is hardcoded.
// ---------------------------------------------------------

function computeRepoInsights(repos) {
  var list = Array.isArray(repos) ? repos : [];

  var totalStars = 0;
  var totalForks = 0;
  var totalSizeKB = 0;
  var originalCount = 0;
  var mostStarred = null;
  var languageCounts = {};

  for (var i = 0; i < list.length; i++) {
    var repo = list[i];
    var stars = repo.stargazers_count || 0;

    totalStars += stars;
    totalForks += repo.forks_count || 0;
    totalSizeKB += repo.size || 0;

    if (!repo.fork) {
      originalCount += 1;
    }
    if (!mostStarred || stars > (mostStarred.stargazers_count || 0)) {
      mostStarred = repo;
    }
    if (repo.language) {
      languageCounts[repo.language] = (languageCounts[repo.language] || 0) + 1;
    }
  }

  var topLanguage = null;
  var topLanguageCount = 0;
  for (var lang in languageCounts) {
    if (languageCounts.hasOwnProperty(lang) && languageCounts[lang] > topLanguageCount) {
      topLanguage = lang;
      topLanguageCount = languageCounts[lang];
    }
  }

  return {
    totalStars: totalStars,
    totalForks: totalForks,
    totalSizeKB: totalSizeKB,
    originalCount: originalCount,
    mostStarred: mostStarred,
    averageStars: list.length ? (totalStars / list.length) : 0,
    topLanguage: topLanguage
  };
}

function calculateInsights(repos) {
  if (!el.insightsSection || !el.insightsList) {
    return;
  }

  var list = Array.isArray(repos) ? repos : [];

  if (list.length === 0) {
    el.insightsList.innerHTML = "<p class=\"empty-note\">This user has no public repositories.</p>";
    if (el.langBars) {
      el.langBars.innerHTML = "";
    }
    setHidden(el.langEmpty, false);
    setHidden(el.insightsSection, false);
    return;
  }

  var insights = computeRepoInsights(list);
  var sizeDisplay = insights.totalSizeKB > 1024
    ? (insights.totalSizeKB / 1024).toFixed(1) + " MB"
    : formatNumber(insights.totalSizeKB) + " KB";

  var rows = [
    ["Total stars received", formatNumber(insights.totalStars)],
    ["Total forks", formatNumber(insights.totalForks)],
    ["Original repositories", formatNumber(insights.originalCount)],
    ["Average stars / repo", insights.averageStars.toFixed(1)],
    ["Combined repo size", sizeDisplay]
  ];

  if (insights.mostStarred && (insights.mostStarred.stargazers_count || 0) > 0) {
    rows.push([
      "Most starred repo",
      insights.mostStarred.name + " (" + formatNumber(insights.mostStarred.stargazers_count) + "\u2605)"
    ]);
  }
  if (insights.topLanguage) {
    rows.push(["Most-used language", insights.topLanguage]);
  }

  var html = "";
  for (var i = 0; i < rows.length; i++) {
    html += "<div class=\"kv-row\"><dt>" + escapeHTML(rows[i][0]) +
      "</dt><dd>" + escapeHTML(String(rows[i][1])) + "</dd></div>";
  }
  el.insightsList.innerHTML = html;

  setHidden(el.insightsSection, false);
}

function calculateLanguages(repos) {
  if (!el.langBars) {
    return;
  }

  var list = Array.isArray(repos) ? repos : [];
  var counts = {};
  var total = 0;

  for (var i = 0; i < list.length; i++) {
    var language = list[i].language;
    if (language) {
      counts[language] = (counts[language] || 0) + 1;
      total += 1;
    }
  }

  var entries = [];
  for (var name in counts) {
    if (counts.hasOwnProperty(name)) {
      entries.push([name, counts[name]]);
    }
  }
  entries.sort(function (a, b) { return b[1] - a[1]; });
  entries = entries.slice(0, 6);

  if (entries.length === 0) {
    el.langBars.innerHTML = "";
    setHidden(el.langEmpty, false);
    return;
  }
  setHidden(el.langEmpty, true);

  var html = "";
  for (var j = 0; j < entries.length; j++) {
    var langName = entries[j][0];
    var count = entries[j][1];
    var percent = total ? Math.round((count / total) * 100) : 0;

    html += "<div class=\"lang-row\">" +
      "<span class=\"lang-name\">" + escapeHTML(langName) + "</span>" +
      "<div class=\"lang-track\"><div class=\"lang-fill\" style=\"width:" + percent +
      "%; background:" + langColor(langName) + "\"></div></div>" +
      "<span class=\"lang-pct\">" + percent + "%</span>" +
      "</div>";
  }
  el.langBars.innerHTML = html;
}

// ---------------------------------------------------------
// Repositories: sort / filter / render / pagination
// ---------------------------------------------------------

function sortRepositories(repos, sortBy) {
  var copy = repos.slice();

  if (sortBy === "stars") {
    copy.sort(function (a, b) { return (b.stargazers_count || 0) - (a.stargazers_count || 0); });
  } else if (sortBy === "forks") {
    copy.sort(function (a, b) { return (b.forks_count || 0) - (a.forks_count || 0); });
  } else if (sortBy === "name") {
    copy.sort(function (a, b) { return a.name.localeCompare(b.name); });
  } else {
    copy.sort(function (a, b) { return new Date(b.updated_at) - new Date(a.updated_at); });
  }
  return copy;
}

function filterRepositories(repos, query) {
  if (!query) {
    return repos;
  }
  var q = query.toLowerCase();
  return repos.filter(function (repo) {
    var nameMatch = repo.name && repo.name.toLowerCase().indexOf(q) !== -1;
    var descMatch = repo.description && repo.description.toLowerCase().indexOf(q) !== -1;
    return nameMatch || descMatch;
  });
}

function displayRepositories() {
  if (!el.reposSection || !el.repoGrid) {
    return;
  }

  var allRepos = state.repos || [];
  var filtered = filterRepositories(allRepos, state.repoFilter);
  var sorted = sortRepositories(filtered, state.repoSort);

  setText(el.repoCountPill, formatNumber(filtered.length));

  if (allRepos.length === 0) {
    el.repoGrid.innerHTML = "";
    if (el.repoEmpty) {
      el.repoEmpty.textContent = "This user has no public repositories.";
      setHidden(el.repoEmpty, false);
    }
    setHidden(el.loadMoreBtn, true);
    setHidden(el.reposSection, false);
    return;
  }

  if (sorted.length === 0) {
    el.repoGrid.innerHTML = "";
    if (el.repoEmpty) {
      el.repoEmpty.textContent = "No repositories match your filter.";
      setHidden(el.repoEmpty, false);
    }
    setHidden(el.loadMoreBtn, true);
    setHidden(el.reposSection, false);
    return;
  }

  setHidden(el.repoEmpty, true);

  var visible = sorted.slice(0, state.visibleRepoCount);
  var html = "";
  for (var i = 0; i < visible.length; i++) {
    html += repoCardHTML(visible[i]);
  }
  el.repoGrid.innerHTML = html;

  setHidden(el.loadMoreBtn, sorted.length <= visible.length);
  setHidden(el.reposSection, false);
}

function repoCardHTML(repo) {
  var language = repo.language;
  var description = repo.description ? escapeHTML(repo.description) : "No description provided.";
  var borderColor = language ? langColor(language) : "var(--border-strong)";
  var url = repo.html_url || "#";

  var languageTag = language
    ? "<span><span class=\"lang-dot\" style=\"background:" + langColor(language) + "\"></span>" +
      escapeHTML(language) + "</span>"
    : "";

  var issuesTag = repo.open_issues_count
    ? "<span>\u25D4 " + formatNumber(repo.open_issues_count) + " issues</span>"
    : "";

  return (
    "<article class=\"repo-card\" style=\"border-left-color:" + borderColor + "\">" +
      "<div class=\"repo-head\">" +
        "<a class=\"repo-name\" href=\"" + url + "\" target=\"_blank\" rel=\"noopener\">" +
          escapeHTML(repo.name) +
        "</a>" +
        "<span class=\"repo-visibility\">" + (repo.private ? "Private" : "Public") + "</span>" +
      "</div>" +
      "<p class=\"repo-desc\">" + description + "</p>" +
      "<div class=\"repo-meta\">" +
        languageTag +
        "<span>\u2B50 " + formatNumber(repo.stargazers_count) + "</span>" +
        "<span>\uD83C\uDF74 " + formatNumber(repo.forks_count) + "</span>" +
        issuesTag +
      "</div>" +
      "<div class=\"repo-foot\">" +
        "<span class=\"repo-updated\">Updated " + timeAgo(repo.updated_at) + "</span>" +
        "<a class=\"repo-link\" href=\"" + url + "\" target=\"_blank\" rel=\"noopener\">View repository \u2192</a>" +
      "</div>" +
    "</article>"
  );
}

// ---------------------------------------------------------
// Favorites
// ---------------------------------------------------------

function isFavorite(login) {
  if (!login) {
    return false;
  }
  for (var i = 0; i < state.favorites.length; i++) {
    if (state.favorites[i].login.toLowerCase() === login.toLowerCase()) {
      return true;
    }
  }
  return false;
}

function saveFavorite(user) {
  if (!user || !user.login || isFavorite(user.login)) {
    return;
  }
  state.favorites.unshift({
    login: user.login,
    name: user.name || "",
    avatar_url: user.avatar_url || "",
    followers: user.followers || 0,
    public_repos: user.public_repos || 0,
    html_url: user.html_url || ""
  });
  saveJSON("gitview:favorites", state.favorites);
  renderFavoriteCount();
}

function removeFavorite(login) {
  state.favorites = state.favorites.filter(function (fav) {
    return fav.login.toLowerCase() !== login.toLowerCase();
  });
  saveJSON("gitview:favorites", state.favorites);
  renderFavoriteCount();
  renderFavoritesView();

  if (state.currentUser && state.currentUser.login.toLowerCase() === login.toLowerCase()) {
    updateFavoriteButton();
  }
}

function updateFavoriteButton() {
  if (!state.currentUser || !el.favIcon || !el.favLabel || !el.favBtn) {
    return;
  }
  var favorited = isFavorite(state.currentUser.login);
  el.favIcon.textContent = favorited ? "\u2605" : "\u2606";
  el.favLabel.textContent = favorited ? "Saved" : "Add to favorites";
  el.favBtn.classList.toggle("active", favorited);
}

function renderFavoriteCount() {
  setText(el.favCount, String(state.favorites.length));
}

function renderFavoritesView() {
  if (!el.favoritesGrid) {
    return;
  }

  if (state.favorites.length === 0) {
    el.favoritesGrid.innerHTML = "";
    setHidden(el.favEmptyNote, false);
    return;
  }
  setHidden(el.favEmptyNote, true);

  var html = "";
  for (var i = 0; i < state.favorites.length; i++) {
    var fav = state.favorites[i];
    html +=
      "<article class=\"fav-card\">" +
        "<img class=\"fav-avatar\" src=\"" + escapeHTML(fav.avatar_url) + "\" alt=\"" +
          escapeHTML(fav.login) + "'s avatar\">" +
        "<div class=\"fav-body\">" +
          "<p class=\"fav-name\">" + escapeHTML(fav.name || fav.login) + "</p>" +
          "<p class=\"fav-login\">@" + escapeHTML(fav.login) + "</p>" +
          "<div class=\"fav-stats\">" +
            "<span>" + formatNumber(fav.followers) + " followers</span>" +
            "<span>" + formatNumber(fav.public_repos) + " repos</span>" +
          "</div>" +
          "<div class=\"fav-actions\">" +
            "<button class=\"btn btn-primary\" data-open-profile=\"" + escapeHTML(fav.login) + "\">Open profile</button>" +
            "<button class=\"btn btn-ghost\" data-remove-fav=\"" + escapeHTML(fav.login) + "\">Remove</button>" +
          "</div>" +
        "</div>" +
      "</article>";
  }
  el.favoritesGrid.innerHTML = html;
}

// ---------------------------------------------------------
// Search history
// ---------------------------------------------------------

function saveHistory(user) {
  if (!user || !user.login) {
    return;
  }
  state.history = state.history.filter(function (item) {
    return item.login.toLowerCase() !== user.login.toLowerCase();
  });
  state.history.unshift({
    login: user.login,
    avatar_url: user.avatar_url || "",
    ts: Date.now()
  });
  state.history = state.history.slice(0, 10);
  saveJSON("gitview:history", state.history);
  renderRecentStrip();
}

function clearHistory() {
  state.history = [];
  saveJSON("gitview:history", state.history);
  renderRecentStrip();
  renderHistoryView();
}

function renderRecentStrip() {
  if (!el.recentStrip || !el.recentChips) {
    return;
  }
  if (state.history.length === 0) {
    setHidden(el.recentStrip, true);
    return;
  }
  setHidden(el.recentStrip, false);

  var html = "";
  var shown = state.history.slice(0, 6);
  for (var i = 0; i < shown.length; i++) {
    html += "<button class=\"chip\" data-open-profile=\"" + escapeHTML(shown[i].login) + "\">" +
      escapeHTML(shown[i].login) + "</button>";
  }
  el.recentChips.innerHTML = html;
}

function renderHistoryView() {
  if (!el.historyList) {
    return;
  }
  if (state.history.length === 0) {
    el.historyList.innerHTML = "";
    setHidden(el.historyEmptyNote, false);
    return;
  }
  setHidden(el.historyEmptyNote, true);

  var html = "";
  for (var i = 0; i < state.history.length; i++) {
    var item = state.history[i];
    html +=
      "<li>" +
        "<button class=\"history-item\" data-open-profile=\"" + escapeHTML(item.login) + "\">" +
          "<span class=\"history-user\">" +
            "<img src=\"" + escapeHTML(item.avatar_url) + "\" alt=\"\" style=\"width:28px;height:28px;border-radius:50%\"> " +
            "@" + escapeHTML(item.login) +
          "</span>" +
          "<span class=\"history-time\">" + timeAgo(new Date(item.ts).toISOString()) + "</span>" +
        "</button>" +
      "</li>";
  }
  el.historyList.innerHTML = html;
}

// ---------------------------------------------------------
// Compare
// ---------------------------------------------------------

function compareUsers(usernameA, usernameB) {
  setHidden(el.compareError, true);
  setHidden(el.compareResult, true);
  setHidden(el.compareSkel, false);

  Promise.all([fetchUser(usernameA), fetchAllRepos(usernameA)])
    .then(function (resultsA) {
      return Promise.all([fetchUser(usernameB), fetchAllRepos(usernameB)])
        .then(function (resultsB) {
          renderCompareTable(
            resultsA[0], resultsA[1],
            resultsB[0], resultsB[1]
          );
        });
    })
    .catch(function (err) {
      var message = "Could not compare these profiles. Check both usernames and try again.";
      if (err && err.type === "not_found") {
        message = "One of these usernames was not found on GitHub.";
      } else if (err && err.type === "rate_limit") {
        message = "GitHub API rate limit reached. Please try again later.";
      } else if (err && err.type === "network_error") {
        message = "The request to GitHub timed out or failed. Try running this file through a local server instead of opening it directly.";
      }
      if (el.compareError) {
        el.compareError.textContent = message;
        el.compareError.hidden = false;
      }
    })
    .then(function () {
      setHidden(el.compareSkel, true);
    });
}

function renderCompareTable(userA, reposA, userB, reposB) {
  var insightsA = computeRepoInsights(reposA);
  var insightsB = computeRepoInsights(reposB);

  var rows = [
    ["Followers", userA.followers, userB.followers],
    ["Following", userA.following, userB.following],
    ["Repositories", userA.public_repos, userB.public_repos],
    ["Public gists", userA.public_gists, userB.public_gists],
    ["Total stars", insightsA.totalStars, insightsB.totalStars],
    ["Total forks", insightsA.totalForks, insightsB.totalForks],
    ["Top language", insightsA.topLanguage || "\u2014", insightsB.topLanguage || "\u2014"]
  ];

  var bodyHtml = "";
  for (var i = 0; i < rows.length; i++) {
    var label = rows[i][0];
    var valueA = rows[i][1];
    var valueB = rows[i][2];
    var numeric = typeof valueA === "number" && typeof valueB === "number";
    var aWins = numeric && valueA > valueB;
    var bWins = numeric && valueB > valueA;

    bodyHtml +=
      "<tr>" +
        "<th>" + escapeHTML(label) + "</th>" +
        "<td class=\"" + (aWins ? "compare-win" : "") + "\">" +
          escapeHTML(numeric ? formatNumber(valueA) : String(valueA)) +
        "</td>" +
        "<td class=\"" + (bWins ? "compare-win" : "") + "\">" +
          escapeHTML(numeric ? formatNumber(valueB) : String(valueB)) +
        "</td>" +
      "</tr>";
  }

  if (el.compareResult) {
    el.compareResult.innerHTML =
      "<table class=\"compare-table\">" +
        "<thead><tr>" +
          "<th></th>" +
          "<th><div class=\"compare-head\"><img src=\"" + escapeHTML(userA.avatar_url) +
            "\" alt=\"\"> @" + escapeHTML(userA.login) + "</div></th>" +
          "<th><div class=\"compare-head\"><img src=\"" + escapeHTML(userB.avatar_url) +
            "\" alt=\"\"> @" + escapeHTML(userB.login) + "</div></th>" +
        "</tr></thead>" +
        "<tbody>" + bodyHtml + "</tbody>" +
      "</table>";
    setHidden(el.compareResult, false);
  }
}

// ---------------------------------------------------------
// URL / sharing
// ---------------------------------------------------------

function updateProfileUrl(username) {
  try {
    var url = new URL(window.location.href);
    url.searchParams.set("user", username);
    window.history.replaceState({}, "", url);
  } catch (err) {
    console.warn("Could not update URL:", err);
  }
}

function copyProfileLink() {
  if (!state.currentUser) {
    return;
  }
  var url;
  try {
    url = new URL(window.location.href);
    url.searchParams.set("user", state.currentUser.login);
  } catch (err) {
    showToast("Could not copy link");
    return;
  }

  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    showToast("Copying isn't supported in this browser");
    return;
  }

  navigator.clipboard.writeText(url.toString())
    .then(function () { showToast("\u2713 Link copied!"); })
    .catch(function () { showToast("Could not copy link"); });
}

// ---------------------------------------------------------
// Theme
// ---------------------------------------------------------

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  saveJSON("gitview:theme", theme); // plain string is valid JSON too
  if (el.iconMoon) {
    el.iconMoon.hidden = theme === "light";
  }
  if (el.iconSun) {
    el.iconSun.hidden = theme !== "light";
  }
}

function toggleTheme() {
  var current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "light" ? "dark" : "light");
}

// ---------------------------------------------------------
// View / nav routing
// ---------------------------------------------------------

var VIEWS = ["explore", "favorites", "history", "compare", "about"];

function showView(name) {
  for (var i = 0; i < VIEWS.length; i++) {
    var section = document.getElementById("view-" + VIEWS[i]);
    if (section) {
      section.hidden = (VIEWS[i] !== name);
    }
  }

  var navButtons = document.querySelectorAll("[data-nav]");
  for (var j = 0; j < navButtons.length; j++) {
    var btn = navButtons[j];
    if (btn.dataset.nav === name) {
      btn.setAttribute("aria-current", "page");
    } else {
      btn.removeAttribute("aria-current");
    }
  }

  if (el.navLinks) {
    el.navLinks.classList.remove("open");
  }
  if (el.hamburger) {
    el.hamburger.setAttribute("aria-expanded", "false");
  }
  window.scrollTo(0, 0);

  if (name === "favorites") {
    renderFavoritesView();
  }
  if (name === "history") {
    renderHistoryView();
  }
}

// ---------------------------------------------------------
// Event wiring
// ---------------------------------------------------------

function initTheme() {
  var saved = loadJSON("gitview:theme", null);
  if (saved !== "light" && saved !== "dark") {
    var prefersLight = window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches;
    saved = prefersLight ? "light" : "dark";
  }
  setTheme(saved);
}

function wireSearch() {
  if (el.searchForm) {
    el.searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      searchUser(el.usernameInput ? el.usernameInput.value : "");
    });
  }

  var tryButtons = document.querySelectorAll("[data-try]");
  for (var i = 0; i < tryButtons.length; i++) {
    tryButtons[i].addEventListener("click", function () {
      searchUser(this.dataset.try);
    });
  }
}

function wireRepoControls() {
  var filterTimer = null;

  if (el.repoFilterInput) {
    el.repoFilterInput.addEventListener("input", function () {
      clearTimeout(filterTimer);
      var value = el.repoFilterInput.value;
      filterTimer = setTimeout(function () {
        state.repoFilter = value.trim();
        state.visibleRepoCount = REPO_PAGE_SIZE;
        displayRepositories();
      }, 200);
    });
  }

  if (el.repoSort) {
    el.repoSort.addEventListener("change", function () {
      state.repoSort = el.repoSort.value;
      displayRepositories();
    });
  }

  if (el.loadMoreBtn) {
    el.loadMoreBtn.addEventListener("click", function () {
      state.visibleRepoCount += REPO_PAGE_SIZE;
      displayRepositories();
    });
  }
}

function wireFavoritesAndSharing() {
  if (el.favBtn) {
    el.favBtn.addEventListener("click", function () {
      if (!state.currentUser) {
        return;
      }
      if (isFavorite(state.currentUser.login)) {
        removeFavorite(state.currentUser.login);
        showToast("Removed from favorites");
      } else {
        saveFavorite(state.currentUser);
        updateFavoriteButton();
        showToast("Added to favorites");
      }
    });
  }

  if (el.copyLinkBtn) {
    el.copyLinkBtn.addEventListener("click", copyProfileLink);
  }

  // One listener on <body> handles buttons that get created dynamically
  // (favorite cards, history rows, recent chips) instead of re-binding
  // a new listener every time the list re-renders.
  document.body.addEventListener("click", function (e) {
    var openBtn = e.target.closest("[data-open-profile]");
    if (openBtn) {
      showView("explore");
      searchUser(openBtn.dataset.openProfile);
      return;
    }
    var removeBtn = e.target.closest("[data-remove-fav]");
    if (removeBtn) {
      removeFavorite(removeBtn.dataset.removeFav);
      showToast("Removed from favorites");
    }
  });
}

function wireHistory() {
  if (el.clearHistoryBtn) {
    el.clearHistoryBtn.addEventListener("click", clearHistory);
  }
}

function wireCompare() {
  if (!el.compareForm) {
    return;
  }
  el.compareForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var a = el.compareUserA ? el.compareUserA.value.trim() : "";
    var b = el.compareUserB ? el.compareUserB.value.trim() : "";

    if (!a || !b) {
      if (el.compareError) {
        el.compareError.textContent = "Enter both usernames to compare.";
        el.compareError.hidden = false;
      }
      return;
    }
    compareUsers(a, b);
  });
}

function wireThemeAndNav() {
  if (el.themeToggle) {
    el.themeToggle.addEventListener("click", toggleTheme);
  }

  var navButtons = document.querySelectorAll("[data-nav]");
  for (var i = 0; i < navButtons.length; i++) {
    navButtons[i].addEventListener("click", function () {
      showView(this.dataset.nav);
    });
  }

  if (el.hamburger && el.navLinks) {
    el.hamburger.addEventListener("click", function () {
      var open = el.navLinks.classList.toggle("open");
      el.hamburger.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  if (el.backToTop) {
    el.backToTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

function loadProfileFromUrl() {
  var params = new URLSearchParams(window.location.search);
  var username = params.get("user");
  if (username) {
    searchUser(username, { updateUrl: false });
  }
}

function init() {
  collectElements();
  initTheme();

  state.favorites = loadJSON("gitview:favorites", []);
  state.history = loadJSON("gitview:history", []);

  renderFavoriteCount();
  renderRecentStrip();

  wireSearch();
  wireRepoControls();
  wireFavoritesAndSharing();
  wireHistory();
  wireCompare();
  wireThemeAndNav();

  loadProfileFromUrl();
}

document.addEventListener("DOMContentLoaded", init);

