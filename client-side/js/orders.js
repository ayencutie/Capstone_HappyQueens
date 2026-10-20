// View Order: the customer's orders, with Cancel (only while Pending) and Pay now.
hqOnReady(async function () {
  var box = document.getElementById('ordersList'), O = HQOrders, esc = hqEsc, orders = [];

  function card(o) {
    var thumb = o.designImage ? '<img class="my-order-thumb" src="' + esc(hqAsset(o.designImage)) + '" alt="Design">' : '<div class="my-order-thumb my-order-thumb-empty"><i class="fa-solid fa-image"></i></div>';
    var refund = O.refundText(o);
    var actions = '<a class="btn btn-outline" href="track-order2.html?order=' + encodeURIComponent(o.orderId) + '">Track</a>';
    if (o.paymentStatus === 'unpaid' && o.status !== 'cancelled') actions += '<button type="button" class="btn btn-filled" data-pay="' + esc(o.orderId) + '">Pay now</button>';
    if (o.deliveryDue) actions += '<button type="button" class="btn btn-filled" data-paydel="' + esc(o.orderId) + '">Pay delivery fee ' + O.peso(o.deliveryFee) + '</button>';
    if (o.canCancel) actions += '<button type="button" class="btn btn-danger" data-cancel="' + esc(o.orderId) + '">Cancel order</button>';
    var note = (!o.canCancel && o.status !== 'cancelled' && o.status !== 'completed') ? '<p class="my-order-note">This order is already being processed, so it can no longer be cancelled.</p>' : '';
    return '<div class="my-order">' + thumb + '<div class="my-order-body">' +
      '<div class="my-order-top"><strong>' + esc(o.orderId) + '</strong><span class="st-badge st-' + o.status + '">' + O.LABEL[o.status] + '</span></div>' +
      '<div class="my-order-service">' + esc(o.service) + ' &times; ' + o.qty + ' &middot; ' + O.dateText(o.date) + '</div>' +
      '<div class="my-order-money"><span>Total <b>' + O.peso(o.total) + '</b></span><span>Paid <b>' + O.peso(o.paid) + '</b></span>' + (o.status !== 'cancelled' && o.balance > 0 ? '<span>Balance <b>' + O.peso(o.balance) + '</b></span>' : '') + '</div>' +
      '<div class="my-order-pay">' + esc(O.payText(o)) + '</div>' +
      '<div class="my-order-pay"><i class="fa-solid fa-truck-fast"></i> ' + esc(O.deliveryText(o)) + '</div>' +
      (refund ? '<div class="my-order-refund"><i class="fa-solid fa-rotate-left"></i> ' + esc(refund) + '</div>' : '') + note +
      '<div class="my-order-actions">' + actions + '</div></div></div>';
  }

  function render() {
    if (!orders.length) { box.innerHTML = '<div class="order-message">You have no orders yet.<br><a class="btn btn-filled" href="our-services.html" style="margin-top:14px;">Browse Services</a></div>'; return; }
    box.innerHTML = orders.map(card).join('');
    box.querySelectorAll('[data-cancel]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var o = orders.find(function (x) { return x.orderId === b.dataset.cancel; });
        b.disabled = true;
        var updated = await O.cancel(o);
        if (updated) orders[orders.indexOf(o)] = updated;
        render();
      });
    });
    box.querySelectorAll('[data-paydel]').forEach(function (b) {
      b.addEventListener('click', function () { b.disabled = true; O.payDelivery(orders.find(function (x) { return x.orderId === b.dataset.paydel; })); });
    });
    box.querySelectorAll('[data-pay]').forEach(function (b) {
      b.addEventListener('click', function () { b.disabled = true; O.payNow(orders.find(function (x) { return x.orderId === b.dataset.pay; })); });
    });
  }

  var r = await hqShop('my_orders');
  if (!r.ok) { box.innerHTML = '<p class="order-message">' + esc(r.error || 'Could not load your orders.') + '</p>'; return; }
  orders = r.orders; render();
});
