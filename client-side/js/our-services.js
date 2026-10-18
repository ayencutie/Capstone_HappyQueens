// Our Services page: the cards come from the services you manage in Admin > Services.
hqOnReady(async function () {
  var grid = document.getElementById('servicesGrid');
  grid.innerHTML = '<p class="services-message">Loading services&hellip;</p>';

  var r = await hqShop('services');
  if (!r.ok) { grid.innerHTML = '<p class="services-message">' + hqEsc(r.error || 'Could not load services.') + '</p>'; return; }
  if (!r.services.length) { grid.innerHTML = '<p class="services-message">No services available right now. Please check back soon!</p>'; return; }

  grid.innerHTML = r.services.map(function (s) {
    var img = s.image
      ? '<img class="service-image" src="' + hqEsc(hqAsset(s.image)) + '" alt="' + hqEsc(s.name) + '">'
      : '<div class="service-image service-image-empty"><i class="fa-solid fa-gift"></i></div>';
    var price = (s.priceText || '').trim();
    var priceHtml = price ? '<div class="service-price">' + (/\d/.test(price) ? 'From &#8369;' : '') + hqEsc(price) + '</div>' : '';
    // the order page set in Admin > Services, or a generic one with the service id
    var href = s.orderUrl ? s.orderUrl : 'order.html?service=' + s.id;
    return '<div class="service-card"><div class="service-image-wrap">' + img + '</div>' +
      '<div class="service-card-body"><h3>' + hqEsc(s.name) + '</h3><p>' + hqEsc(s.description) + '</p>' + priceHtml +
      '<button type="button" class="btn btn-order-now" data-href="' + hqEsc(href) + '">Order Now</button></div></div>';
  }).join('');

  grid.querySelectorAll('[data-href]').forEach(function (b) {
    b.addEventListener('click', function () {
      var href = b.dataset.href;
      if (document.body.dataset.guest) {   // guests log in first, then continue to the order page
        try { sessionStorage.setItem('hq_next', href); } catch (e) {}
        if (window.openLoginModal) openLoginModal();
        return;
      }
      window.location.href = href;
    });
  });
});
