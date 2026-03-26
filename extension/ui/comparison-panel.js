// comparison-panel.js
// Renders the "Quick Comparison" panel — matches Figma node 79-1361

window.ComparisonPanel = {
  panel: null,
  _allListings: [],
  _guestCount: 1,

  // 15 amenity icons — Font Awesome 6 Free Solid
  AMENITIES: [
    { key: 'cancellation', label: 'Calendar',   svg: '<svg viewBox="0 0 448 512" fill="currentColor"><path d="M96 32V64H48C21.5 64 0 85.5 0 112v48H448V112c0-26.5-21.5-48-48-48H352V32c0-17.7-14.3-32-32-32s-32 14.3-32 32V64H160V32c0-17.7-14.3-32-32-32S96 14.3 96 32zM448 192H0V464c0 26.5 21.5 48 48 48H400c26.5 0 48-21.5 48-48V192z"/></svg>' },
    { key: 'wifi',         label: 'Wifi',       svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M320 160C229.1 160 146.8 196 86.3 254.6C73.6 266.9 53.3 266.6 41.1 253.9C28.9 241.2 29.1 220.9 41.8 208.7C113.7 138.9 211.9 96 320 96C428.1 96 526.3 138.9 598.3 208.7C611 221 611.3 241.3 599 253.9C586.7 266.5 566.4 266.9 553.8 254.6C493.2 196 410.9 160 320 160zM272 496C272 469.5 293.5 448 320 448C346.5 448 368 469.5 368 496C368 522.5 346.5 544 320 544C293.5 544 272 522.5 272 496zM200 390.2C188.3 403.5 168.1 404.7 154.8 393C141.5 381.3 140.3 361.1 152 347.8C193 301.4 253.1 272 320 272C386.9 272 447 301.4 488 347.8C499.7 361.1 498.4 381.3 485.2 393C472 404.7 451.7 403.4 440 390.2C410.6 356.9 367.8 336 320 336C272.2 336 229.4 356.9 200 390.2z"/></svg>' },
    { key: 'instantBook',  label: 'Instant',    svg: '<svg viewBox="0 0 448 512" fill="currentColor"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288H175.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7H272.5L349.4 44.6z"/></svg>' },
    { key: 'parking',      label: 'Parking',    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M199.2 181.4L173.1 256L466.9 256L440.8 181.4C436.3 168.6 424.2 160 410.6 160L229.4 160C215.8 160 203.7 168.6 199.2 181.4zM103.6 260.8L138.8 160.3C152.3 121.8 188.6 96 229.4 96L410.6 96C451.4 96 487.7 121.8 501.2 160.3L536.4 260.8C559.6 270.4 576 293.3 576 320L576 512C576 529.7 561.7 544 544 544L512 544C494.3 544 480 529.7 480 512L480 480L160 480L160 512C160 529.7 145.7 544 128 544L96 544C78.3 544 64 529.7 64 512L64 320C64 293.3 80.4 270.4 103.6 260.8zM192 368C192 350.3 177.7 336 160 336C142.3 336 128 350.3 128 368C128 385.7 142.3 400 160 400C177.7 400 192 385.7 192 368zM480 400C497.7 400 512 385.7 512 368C512 350.3 497.7 336 480 336C462.3 336 448 350.3 448 368C448 385.7 462.3 400 480 400z"/></svg>' },
    { key: 'keyAccess',    label: 'Self Check', svg: '<svg viewBox="0 0 512 512" fill="currentColor"><path d="M336 352c97.2 0 176-78.8 176-176S433.2 0 336 0S160 78.8 160 176c0 18.7 2.9 36.8 8.3 53.7L7 391c-4.5 4.5-7 10.6-7 17v80c0 13.3 10.7 24 24 24h80c13.3 0 24-10.7 24-24V448h40c13.3 0 24-10.7 24-24V384h40c6.4 0 12.5-2.5 17-7l33.3-33.3c16.9 5.4 35 8.3 53.7 8.3zm40-176a40 40 0 1 1 -80 0 40 40 0 1 1 80 0z"/></svg>' },
    { key: 'beachAccess',  label: 'Beach',      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M561.5 405.1C555.6 421.8 536.2 428.1 520.4 420.2L342.2 331.1L340.6 334.3L251.8 512L544 512C561.7 512 576 526.3 576 544C576 561.7 561.7 576 544 576L96 576C78.3 576 64 561.7 64 544C64 526.3 78.3 512 96 512L180.2 512L283.4 305.7L285 302.5L119.6 219.8C103.8 211.9 97.2 192.5 107.1 177.8C153 109.2 231.2 64 320 64C461.4 64 576 178.6 576 320C576 349.8 570.9 378.5 561.5 405.1z"/></svg>' },
    { key: 'pool',         label: 'Pool',       svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M374.5 469.7C412.9 440.7 465 440.7 503.5 469.7C520.4 482.4 536.4 491.2 551.3 494.3C565 497.1 578.7 495.2 593.6 484C604.2 476 619.2 478.1 627.2 488.7C635.2 499.3 633 514.4 622.4 522.3C596 542.2 568.2 546.7 541.7 541.4C516.4 536.3 493.6 522.5 474.5 508.1C453.2 492 424.6 492 403.3 508.1C379.1 526.4 351 544 319.9 544C288.8 544 260.8 526.3 236.6 508.1C215.3 492 186.7 492 165.4 508.1C141.6 526 111.3 543.6 77.3 543.4C56.9 543.3 36.6 536.7 17.5 522.3C6.9 514.3 4.8 499.3 12.8 488.7C20.8 478.1 35.8 476 46.4 484C57.7 492.5 68 495.4 77.6 495.5C95.2 495.6 114.9 486.1 136.5 469.8C174.9 440.8 227.1 440.8 265.5 469.8C289.5 487.9 306.2 496.1 320 496.1C333.8 496.1 350.5 487.9 374.5 469.8zM511.8 96C560.1 96 600.8 132 606.8 179.9L607.8 188.1C610 205.6 597.6 221.6 580 223.8C562.4 226 546.5 213.6 544.3 196L543.3 187.8C541.3 171.9 527.8 160 511.8 160C494.3 160 480 174.2 480 191.8L480 403.6C456.9 398.5 435.1 399.2 416 403.2L416 352L224 352L224 400.7C218.7 400.2 213.3 399.9 208 400C191.8 400.1 175.6 402.7 160 408L160 191.8C160 138.9 202.9 96 255.7 96C304 96 344.7 132 350.7 179.9L351.7 188.1C353.9 205.6 341.5 221.6 323.9 223.8C306.3 226 290.4 213.6 288.2 196L287.2 187.8C285.2 171.9 271.7 160 255.7 160C238.2 160 224 174.2 224 191.8L224 288L416 288L416 191.8C416 138.9 458.9 96 511.8 96z"/></svg>' },
    { key: 'kitchen',      label: 'Kitchen',    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M272 208C272 155 229 112 176 112C123 112 80 155 80 208C80 261 123 304 176 304C229 304 272 261 272 208zM316.4 240C301.9 304.1 244.5 352 176 352C96.5 352 32 287.5 32 208C32 128.5 96.5 64 176 64C244.5 64 301.9 111.9 316.4 176L388.2 176C397 166.2 409.8 160 424 160L528 160C554.5 160 576 181.5 576 208C576 234.5 554.5 256 528 256L424 256C409.8 256 397 249.8 388.2 240L316.4 240zM176 144C211.3 144 240 172.7 240 208C240 243.3 211.3 272 176 272C140.7 272 112 243.3 112 208C112 172.7 140.7 144 176 144zM432 304C445.3 304 456 314.7 456 328L456 336L552 336C565.3 336 576 346.7 576 360C576 373.3 565.3 384 552 384L312 384C298.7 384 288 373.3 288 360C288 346.7 298.7 336 312 336L408 336L408 328C408 314.7 418.7 304 432 304zM320 528L320 416L544 416L544 528C544 554.5 522.5 576 496 576L368 576C341.5 576 320 554.5 320 528zM80 384L208 384C234.5 384 256 405.5 256 432C256 458.5 234.5 480 208 480L192 480C192 497.7 177.7 512 160 512L96 512C78.3 512 64 497.7 64 480L64 400C64 391.2 71.2 384 80 384zM208 448C216.8 448 224 440.8 224 432C224 423.2 216.8 416 208 416L192 416L192 448L208 448zM56 528L232 528C245.3 528 256 538.7 256 552C256 565.3 245.3 576 232 576L56 576C42.7 576 32 565.3 32 552C32 538.7 42.7 528 56 528z"/></svg>' },
    { key: 'ac',           label: 'A/C',        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M352.2 64C352.2 46.3 337.9 32 320.2 32C302.5 32 288.2 46.3 288.2 64L288.2 126.1L273.2 111.1C263.8 101.7 248.6 101.7 239.3 111.1C230 120.5 229.9 135.7 239.3 145L288.3 194L288.3 264.6L227.1 229.3L209.2 162.4C205.8 149.6 192.6 142 179.8 145.4C167 148.8 159.3 162 162.7 174.8L168.2 195.3L114.5 164.3C99.2 155.5 79.6 160.7 70.8 176C62 191.3 67.2 210.9 82.5 219.7L136.2 250.7L115.7 256.2C102.9 259.6 95.3 272.8 98.7 285.6C102.1 298.4 115.3 306 128.1 302.6L195 284.7L256.2 320L195 355.3L128.1 337.4C115.3 334 102.1 341.6 98.7 354.4C95.3 367.2 102.9 380.4 115.7 383.8L136.2 389.3L82.5 420.3C67.2 429.1 62 448.7 70.8 464C79.6 479.3 99.2 484.6 114.5 475.7L168.2 444.7L162.7 465.2C159.3 478 166.9 491.2 179.7 494.6C192.5 498 205.7 490.4 209.1 477.6L227 410.7L288.2 375.4L288.2 446L239.2 495C229.8 504.4 229.8 519.6 239.2 528.9C248.6 538.2 263.8 538.3 273.1 528.9L288.1 513.9L288.1 576C288.1 593.7 302.4 608 320.1 608C337.8 608 352.1 593.7 352.1 576L352.1 513.9L367.1 528.9C376.5 538.3 391.7 538.3 401 528.9C410.3 519.5 410.4 504.3 401 495L352 446L352 375.4L413.2 410.7L431.1 477.6C434.5 490.4 447.7 498 460.5 494.6C473.3 491.2 480.9 478 477.5 465.2L472 444.7L525.7 475.7C541 484.5 560.6 479.3 569.4 464C578.2 448.7 573 429.1 557.7 420.3L504 389.3L524.5 383.8C537.3 380.4 544.9 367.2 541.5 354.4C538.1 341.6 524.9 334 512.1 337.4L445.2 355.3L384 320L445.2 284.7L512.1 302.6C524.9 306 538.1 298.4 541.5 285.6C544.9 272.8 537.3 259.6 524.5 256.2L504 250.7L557.7 219.7C573 210.9 578.3 191.3 569.4 176C560.5 160.7 541 155.5 525.7 164.3L472 195.3L477.5 174.8C480.9 162 473.3 148.8 460.5 145.4C447.7 142 434.5 149.6 431.1 162.4L413.2 229.3L352 264.6L352 194L401 145C410.4 135.6 410.4 120.4 401 111.1C391.6 101.8 376.4 101.7 367.1 111.1L352.1 126.1L352.1 64z"/></svg>' },
    { key: 'fan',          label: 'Fan',        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13 6.03V3c0-.55-.45-1-1-1-3.16 0-5.68 3.88-5.97 9H3c-.55 0-1 .45-1 1 0 3.16 3.88 5.68 9 5.97V21c0 .55.45 1 1 1 3.16 0 5.68-3.88 5.97-9H21c.55 0 1-.45 1-1 0-3.16-3.88-5.68-9-5.97M17 11c-.55 0-1 .45-1 1 0 3.89-1.44 6.81-3 7.71V17c0-.55-.45-1-1-1-3.89 0-6.81-1.44-7.71-3H7c.55 0 1-.45 1-1 0-3.89 1.44-6.81 3-7.71V7c0 .55.45 1 1 1 3.89 0 6.81 1.44 7.71 3z"></path><path d="M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3"></path></svg>' },
    { key: 'washer',       label: 'Washer',     svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 22H5c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2M5 4v16h14V4z"></path><path d="M12 8c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5m2.84 6.16c-.34 1.01-1.22 1.8-2.27 2-.22.04-.45.06-.68.05a3.006 3.006 0 0 1-2.9-3.11c.4.15.88.26 1.49.26 1.37 0 2.1-.54 2.69-.97.36-.26.67-.49 1.12-.6.17-.04.34.05.41.2.32.68.36 1.46.11 2.17ZM14 5a1 1 0 1 0 0 2 1 1 0 1 0 0-2m3 0a1 1 0 1 0 0 2 1 1 0 1 0 0-2"></path></svg>' },
    { key: 'dryer',        label: 'Dryer',      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="m19,22H5c-1.1,0-2-.9-2-2V4c0-1.1.9-2,2-2h14c1.1,0,2,.9,2,2v16c0,1.1-.9,2-2,2ZM5,4v16h14V4H5Z"/><path d="M14 5A1 1 0 1 0 14 7 1 1 0 1 0 14 5z"/><path d="M17 5A1 1 0 1 0 17 7 1 1 0 1 0 17 5z"/><path d="m12,8c-2.76,0-5,2.24-5,5s2.24,5,5,5,5-2.24,5-5-2.24-5-5-5Zm-1.18,4.61c.33.27.78.65.78,1.38s-.45,1.11-.78,1.38c-.31.26-.42.37-.42.62h-1c0-.73.45-1.11.78-1.38.31-.26.42-.37.42-.62s-.11-.36-.42-.62c-.33-.27-.78-.65-.78-1.38s.45-1.11.78-1.38c.31-.26.42-.37.42-.61h1c0,.73-.45,1.11-.78,1.38-.31.26-.42.37-.42.61s.11.36.42.62Zm3,0c.33.27.78.65.78,1.38s-.45,1.11-.78,1.38c-.31.26-.42.37-.42.62h-1c0-.73.45-1.11.78-1.38.31-.26.42-.37.42-.62s-.11-.36-.42-.62c-.33-.27-.78-.65-.78-1.38s.45-1.11.78-1.38c.31-.26.42-.37.42-.61h1c0,.73-.45,1.11-.78,1.38-.31.26-.42.37-.42.61s.11.36.42.62Z"/></svg>' },
    { key: 'petsAllowed',  label: 'Pets',       svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" fill="currentColor"><path d="M298.5 156.9C312.8 199.8 298.2 243.1 265.9 253.7C233.6 264.3 195.8 238.1 181.5 195.2C167.2 152.3 181.8 109 214.1 98.4C246.4 87.8 284.2 114 298.5 156.9zM164.4 262.6C183.3 295 178.7 332.7 154.2 346.7C129.7 360.7 94.5 345.8 75.7 313.4C56.9 281 61.4 243.3 85.9 229.3C110.4 215.3 145.6 230.2 164.4 262.6zM133.2 465.2C185.6 323.9 278.7 288 320 288C361.3 288 454.4 323.9 506.8 465.2C510.4 474.9 512 485.3 512 495.7L512 497.3C512 523.1 491.1 544 465.3 544C453.8 544 442.4 542.6 431.3 539.8L343.3 517.8C328 514 312 514 296.7 517.8L208.7 539.8C197.6 542.6 186.2 544 174.7 544C148.9 544 128 523.1 128 497.3L128 495.7C128 485.3 129.6 474.9 133.2 465.2zM485.8 346.7C461.3 332.7 456.7 295 475.6 262.6C494.5 230.2 529.6 215.3 554.1 229.3C578.6 243.3 583.2 281 564.3 313.4C545.4 345.8 510.3 360.7 485.8 346.7zM374.1 253.7C341.8 243.1 327.2 199.8 341.5 156.9C355.8 114 393.6 87.8 425.9 98.4C458.2 109 472.8 152.3 458.5 195.2C444.2 238.1 406.4 264.3 374.1 253.7z"/></svg>' },
    { key: 'hairDryer',    label: 'Hair Dryer', svg: '<svg viewBox="0 0 48 48" fill="currentColor"><path d="M24.46 42.15c-.33.63-.9 1.09-1.58 1.27l-4.01 1.49C18.71 44.97 18.53 45 18.35 45c-1.16 0-2.15-.78-2.43-1.89-.45-1.09-3.32-8.27-3.83-14.7C13.29 28.8 14.57 29 15.9 29c1.57 0 3.3-.31 5.05-.75.4 3.52 2.18 8.58 3.58 11.74C24.84 40.69 24.81 41.47 24.46 42.15zM42 10.71v10.58c0 .92-.5 1.76-1.3 2.2s-1.78.4-2.54-.09c-2.13-1.37-3.86-1.99-5.16-2.24V10.84c1.3-.25 3.03-.87 5.16-2.24.76-.49 1.74-.52 2.54-.09C41.5 8.95 42 9.79 42 10.71zM25.86 9.03c1.42.6 2.96 1.26 4.14 1.65v10.65c-1.18.38-2.72 1.04-4.14 1.64C22.54 24.39 18.78 26 15.9 26 10.44 26 6 21.51 6 16s4.44-10 9.9-10C18.78 6 22.54 7.61 25.86 9.03zM16 13c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3S17.657 13 16 13z"/></svg>' },
    { key: 'tv',           label: 'TV',         svg: '<svg viewBox="0 0 640 512" fill="currentColor"><path d="M64 64V352H576V64H64zM0 64C0 28.7 28.7 0 64 0H576c35.3 0 64 28.7 64 64V352c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V64zM128 448H512c17.7 0 32 14.3 32 32s-14.3 32-32 32H128c-17.7 0-32-14.3-32-32s14.3-32 32-32z"/></svg>' },
  ],

  show(selectedListings, allListings, onSwap, onDeselect) {
    this._allListings = allListings;
    this._guestCount = (typeof AirbnbScraper !== 'undefined') ? AirbnbScraper.getSelectedGuestCount() : 1;
    if (this.panel) this.panel.remove();

    const panel = document.createElement('div');
    panel.id = 'airbnb-comparison-panel';
    panel.className = 'airbnb-comparison-panel';
    panel.innerHTML = this._buildHTML(selectedListings);

    const target = this._findInsertionTarget();
    if (target) {
      target.prepend(panel);
    } else {
      document.body.prepend(panel);
    }

    this.panel = panel;
    this._attachListeners(selectedListings, onSwap, onDeselect);
  },

  hide() {
    this.panel?.remove();
    this.panel = null;
  },

  update(selectedListings, allListings, onSwap, onDeselect) {
    if (this.panel) {
      this.show(selectedListings, allListings, onSwap, onDeselect);
    }
  },

  _findInsertionTarget() {
    return (
      document.querySelector('[data-testid="wishlist-tab-section"]') ||
      document.querySelector('#wishlist-tab-section') ||
      document.querySelector('main > section > div')
    );
  },

  _buildHTML(listings) {
    const cols = listings.map((l, i) => this._buildColumn(l, i)).join('');
    return `
      <div class="airbnb-cp-header">
        <span class="airbnb-cp-title">Quick Comparison</span>
        <button class="airbnb-cp-close" id="airbnb-cp-close-btn" aria-label="Close comparison">✕</button>
      </div>
      <div class="airbnb-cp-columns">
        ${cols}
      </div>
    `;
  },

  _buildColumn(listing, slotIndex) {
    const amenities = listing.amenities || {};
    const guestCount = this._guestCount || 1;

    // Nightly price: prefer card DOM price (visible when dates selected), then background fetch
    const nightlyPrice = (listing.nightlyPrice > 0 ? listing.nightlyPrice : null)
      || (amenities.nightlyPrice > 0 ? amenities.nightlyPrice : null)
      || AirbnbScraper.parsePriceText(listing.priceText);

    const pricePerPerson = (nightlyPrice && guestCount > 0) ? Math.round(nightlyPrice / guestCount) : null;
    const priceDisplay = pricePerPerson ? `$${pricePerPerson.toLocaleString()}/pp` : '—';

    const dropdownOptions = this._allListings
      .map((l) => {
        const label = l.title || l.locationTitle;
        return `<option value="${l.id}" ${l.id === listing.id ? 'selected' : ''}>${label}</option>`;
      })
      .join('');

    return `
      <div class="airbnb-cp-col" data-slot="${slotIndex}">
        <!-- Dropdown -->
        <div class="airbnb-cp-dropdown-wrap">
          <select class="airbnb-cp-dropdown" data-slot="${slotIndex}" aria-label="Select listing for slot ${slotIndex + 1}">
            ${dropdownOptions}
          </select>
          <span class="airbnb-cp-dropdown-arrow">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6L8 10L12 6" stroke="#FF395C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>

        <!-- Price per person -->
        <div class="airbnb-cp-price-pp">${priceDisplay}</div>

        <!-- Beds / baths / guests -->
        <div class="airbnb-cp-stats">
          ${amenities.beds != null ? `<span>${amenities.beds} bed${amenities.beds !== 1 ? 's' : ''}</span>` : ''}
          ${amenities.baths != null ? `<span>${amenities.baths} bath${amenities.baths !== 1 ? 's' : ''}</span>` : ''}
          ${amenities.maxGuests != null ? `<span>${amenities.maxGuests} guests max</span>` : ''}
        </div>

        <!-- Amenity icon grid card -->
        <div class="airbnb-cp-icon-card">
          <div class="airbnb-cp-icon-grid">
            ${this._buildIconGrid(amenities)}
          </div>
        </div>
      </div>
    `;
  },

  _buildIconGrid(amenities) {
    return this.AMENITIES.map(({ key, label, svg }) => {
      const value = amenities[key];
      let available;

      if (key === 'cancellation') {
        available = value && value !== 'unknown';
      } else {
        available = value === true;
      }

      // If amenities haven't loaded yet, show neutral state
      const hasData = Object.keys(amenities).length > 3; // more than just maxGuests/baths/nightlyPrice
      const stateClass = !hasData ? 'airbnb-cp-icon--unknown' : (available ? 'airbnb-cp-icon--available' : 'airbnb-cp-icon--unavailable');

      return `
        <div class="airbnb-cp-icon-item ${stateClass}" title="${label}">
          <div class="airbnb-cp-icon-svg">${svg}</div>
          <span class="airbnb-cp-icon-label">${label}</span>
        </div>
      `;
    }).join('');
  },

  _attachListeners(listings, onSwap, onDeselect) {
    if (!this.panel) return;

    this.panel.querySelectorAll('.airbnb-cp-dropdown').forEach((select) => {
      select.addEventListener('change', (e) => {
        const slotIndex = parseInt(e.target.getAttribute('data-slot'));
        const newListing = this._allListings.find((l) => l.id === e.target.value);
        if (newListing) onSwap(slotIndex, newListing);
      });
    });

    const closeBtn = this.panel.querySelector('#airbnb-cp-close-btn');
    closeBtn?.addEventListener('click', () => onDeselect(null));

  },
};
