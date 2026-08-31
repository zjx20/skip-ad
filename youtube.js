// ===================================================================
// Layer 1: InnerTube API interception
//
// Overriding window.fetch / XMLHttpRequest only works on the page's
// own requests when this script runs in the page's MAIN world, and the
// hooks must be installed before YouTube's scripts run. Both are
// guaranteed by manifest.json: "world": "MAIN" + "run_at":
// "document_start". If either is removed there, this whole layer
// silently becomes a no-op and only the DOM layer below keeps working.
// ===================================================================
(() => {
  'use strict';

  const LOG = (...args) => console.error('[skip-ad]', ...args);

  // Endpoints that carry player data:
  //   /youtubei/v1/player : direct player data request
  //   /youtubei/v1/next   : SPA in-site navigation; ad fields may sit at
  //                         the top level or nested in .playerResponse
  const PLAYER_API_RE = /\/youtubei\/v1\/(player|next)\b/;
  const AD_FIELDS = ['adPlacements', 'adSlots', 'playerAds'];
  const PLAYABILITY_AD_KEYS = ['adBlacking', 'adSurvey'];

  // Empties the ad-related fields of one player-response-shaped object.
  function pruneAdFields(obj) {
    let modified = false;
    if (!obj || typeof obj !== 'object') return false;

    for (const key of AD_FIELDS) {
      if (key in obj) {
        if (Array.isArray(obj[key]) ? obj[key].length : true) {
          obj[key] = [];
          modified = true;
        }
      }
    }

    const ps = obj.playabilityStatus;
    if (ps && typeof ps === 'object') {
      for (const key of PLAYABILITY_AD_KEYS) {
        if (key in ps) {
          delete ps[key];
          modified = true;
        }
      }
    }

    return modified;
  }

  function pruneAdsFromResponse(json) {
    if (!json || typeof json !== 'object') return false;
    const prunedTop = pruneAdFields(json);
    // /next responses nest the player data in .playerResponse
    const prunedNested = pruneAdFields(json.playerResponse);
    return prunedTop || prunedNested;
  }

  // ---- hook fetch ----
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const promise = origFetch.apply(this, arguments);

    if (PLAYER_API_RE.test(url)) {
      return promise.then(async (response) => {
        try {
          const json = await response.clone().json();
          if (pruneAdsFromResponse(json)) {
            LOG('pruned ad fields from player API response (fetch)');
            return new Response(JSON.stringify(json), {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers
            });
          }
        } catch (e) {
          // not JSON (or parse failed): return the original response
        }
        return response;
      });
    }
    return promise;
  };

  // ---- hook XMLHttpRequest ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__skipAdUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__skipAdUrl && PLAYER_API_RE.test(this.__skipAdUrl)) {
      this.addEventListener('readystatechange', function () {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const json = JSON.parse(this.responseText);
            if (pruneAdsFromResponse(json)) {
              LOG('pruned ad fields from player API response (XHR)');
              // responseText/response are read-only; shadow them
              const patched = JSON.stringify(json);
              Object.defineProperty(this, 'responseText', { get: () => patched });
              Object.defineProperty(this, 'response', { get: () => patched });
            }
          } catch (e) { /* not JSON: leave it alone */ }
        }
      });
    }
    return origSend.call(this, body);
  };

  // ---- intercept the inline ytInitialPlayerResponse ----
  // On a cold page load the player data arrives as an inline script that
  // assigns this global. We run before that script, so trap the
  // assignment itself instead of polling after the fact (polling can
  // lose the race against the player reading the variable).
  (function hookInitialPlayerResponse() {
    let value = window.ytInitialPlayerResponse;
    if (pruneAdsFromResponse(value)) {
      LOG('pruned ad fields from ytInitialPlayerResponse');
    }
    try {
      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        configurable: true,
        get: () => value,
        set: (v) => {
          if (pruneAdsFromResponse(v)) {
            LOG('pruned ad fields from ytInitialPlayerResponse');
          }
          value = v;
        }
      });
    } catch (e) {
      // property not configurable: fall back to polling for ~10s
      let tries = 0;
      const timer = setInterval(() => {
        if (pruneAdsFromResponse(window.ytInitialPlayerResponse)) {
          LOG('pruned ad fields from ytInitialPlayerResponse (poll)');
        }
        if (++tries > 20) clearInterval(timer);
      }, 500);
    }
  })();

  LOG('API interception installed');
})();

// ===================================================================
// Layer 2: DOM fallback — clicks skip buttons / fast-forwards ads that
// slip past the API layer.
// ===================================================================
setInterval(() => {
  for (const button of document.getElementsByClassName("ytp-ad-skip-button")) {
    button.click(); // "Skip Ad" or "Skip Ads" buttons
  }
  for (const button of document.getElementsByClassName("ytp-ad-skip-button-modern")) {
    button.click(); // "Skip Ad" or "Skip Ads" buttons
  }
  for (const button of document.getElementsByClassName("ytp-skip-ad-button")) {
    button.click(); // "Skip Ad" or "Skip Ads" buttons
  }

  const commonSkip = function() {
    const video = document.getElementsByClassName('html5-main-video')[0];
    if (!video.paused) {
      video.currentTime = video.duration;
    }
    if (video.paused) {
      for (const button of document.getElementsByClassName("ytp-large-play-button")) {
        button.click(); // press the center play button
      }
    }
  };

  const trySkipIfProgressBarIsYellow = function(progressBarId) {
    const progressBars = document.getElementsByClassName(progressBarId);
    if (progressBars.length == 0) {
      return;
    }
    if (getComputedStyle(progressBars[0])['background-color'] === 'rgb(255, 204, 0)') {
      commonSkip();
      console.error("skipped youtube ad, progress bar", progressBarId);
    }
  };

  const trySkipForIfElemExists = function(selector) {
    const elems = document.querySelectorAll(selector);
    if (elems.length > 0) {
      commonSkip();
      console.error("skipped youtube ad, selector", selector);
    }
  };

  const trySkipYouThereDialog = function() {
    const dialogs = document.getElementsByTagName('ytmusic-you-there-renderer');
    if (dialogs.length > 0 && getComputedStyle(dialogs[0].parentElement)['display'] !== 'none') {
      for (const button of document.querySelectorAll("ytmusic-you-there-renderer button")) {
        console.error("skipped you there dialog");
        button.click();
      }
    }
  };

  const trySkipGoingToPauseToast = function() {
    const toasts = document.querySelectorAll("tp-yt-paper-toast#toast.paper-toast-open");
    if (toasts.length > 0) {
      let buttonCount = 0;
      let lastButton = null;
      for (const button of toasts[0].querySelectorAll("#action-button button")) {
        if (getComputedStyle(button)['display'] !== 'none') {
          buttonCount++;
          lastButton = button;
        }
      }
      if (buttonCount == 1) {
        console.error("skipped going to pause toast");
        lastButton.click();
      }
    }
  };

  const trySkipAntiAntiAD = function() {
    const button = document.getElementById('dismiss-button');
    if (button) {
      console.error("skipped anti anti-ad model view");
      button.click();

      // resume playback
      const playButtons = document.getElementsByClassName('ytp-play-button');
      if (playButtons.length > 0) {
        for (const button of playButtons) {
          button.click();
        }
      }
    }
  };

  trySkipIfProgressBarIsYellow('ytp-play-progress');
  trySkipIfProgressBarIsYellow('tp-yt-paper-progress');
  trySkipForIfElemExists('.ytp-ad-player-overlay-progress-bar');
  trySkipYouThereDialog();
  trySkipGoingToPauseToast();
  // trySkipAntiAntiAD();
}, 300);

// how to debug:
//   1. in incognito mode, clear all cookies
//   2. execute this js when the AD is playing:
//      ```
//      document.getElementsByClassName('html5-main-video')[0].pause();
//      ```
