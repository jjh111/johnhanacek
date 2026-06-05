/*
 * jh-chrome.js — single source of truth for shared site chrome + identity.
 *
 * Defines the <jh-footer> custom element. It renders in LIGHT DOM (no shadow root)
 * and sets display:contents on itself, so the existing styles/shared.css rules for
 * `footer` and `.footer-oval` apply unchanged — the element is invisible to layout.
 *
 * Replaces ~6 copy-pasted footer blocks (and standardizes the divergent
 * services/nanome2 footers + the search page's missing version line) with one source.
 * <jh-nav> will follow here. Loaded with `defer` on each page; bump its ?v= via
 * scripts/sync-version.mjs on change.
 */
(function () {
  const SITE = {
    year: 2026,
    org: 'JHDesign LLC',
    versionLabel: 'Portfolio v1.9',
    versionNote: 'Made with Claude Code &amp; Open Code',
    github: 'https://github.com/jjh111/johnhanacek',
    githubLabel: 'github.com/jjh111/johnhanacek',
    sig: './Assets/footer-JHsig.png'
  };
  window.JH_SITE = SITE;

  class JHFooter extends HTMLElement {
    connectedCallback() {
      this.style.display = 'contents'; // host vanishes from layout; .footer-oval is the visual child
      this.innerHTML =
        '<div class="footer-oval">' +
          '<p class="footer-signature"><img src="' + SITE.sig + '" alt="John Hanacek signature" loading="lazy"></p>' +
          '<p class="footer-copyright">© ' + SITE.year + ' John Hanacek · ' + SITE.org + '</p>' +
          '<p class="footer-github"><a href="' + SITE.github + '" target="_blank" rel="noopener">' + SITE.githubLabel + '</a></p>' +
          '<p class="version">' + SITE.versionLabel + '<br>' + SITE.versionNote + '</p>' +
        '</div>';
    }
  }
  if (!customElements.get('jh-footer')) customElements.define('jh-footer', JHFooter);
})();
