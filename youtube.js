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
