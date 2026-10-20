// Track Order: pick one of your orders and see where it is.
hqOnReady(async function () {
  var $ = function (id) { return document.getElementById(id); }, O = HQOrders, esc = hqEsc;
  var sel = $('orderSelect'), orders = [];

  var r = await hqShop('my_orders');
  if (!r.ok) { sel.innerHTML = '<option value="">Could not load your orders</option>'; $('trackHelper').textContent = r.error || ''; sel.disabled = true; return; }
  orders = r.orders;
  if (!orders.length) { sel.innerHTML = '<option value="">You have no orders yet</option>'; sel.disabled = true; $('trackSubmit').disabled = true; $('trackHelper').innerHTML = 'Place an order first from <a href="our-services.html"><b>Our Services</b></a>.'; return; }
  sel.innerHTML = orders.map(function (o) { return '<option value="' + esc(o.orderId) + '">' + esc(o.orderId) + ' \u2014 ' + esc(o.service) + ' (' + O.LABEL[o.status] + ')</option>'; }).join('');

  function render(o) {
    var steps = '';
    if (o.status === 'cancelled') {
      var t = O.refundText(o);
      steps = '<div class="track-cancelled"><i class="fa-solid fa-circle-xmark"></i><div><b>This order was cancelled.</b>' + (t ? '<p>' + esc(t) + '</p>' : '') + '</div></div>';
    } else {
      var idx = O.STEPS.indexOf(o.status);
      steps = '<ol class="track-steps">' + O.STEPS.map(function (s, i) {
        return '<li class="' + (i < idx ? 'is-done' : i === idx ? 'is-current' : '') + '"><span class="track-dot">' + (i < idx ? '<i class="fa-solid fa-check"></i>' : i + 1) + '</span><span class="track-step-name">' + O.LABEL[s] + '</span></li>';
      }).join('') + '</ol>';
    }

    var deliveryRow = o.fulfillment === 'delivery'
      ? '<div class="summary-row"><span>Lalamove delivery fee</span><span>' + (o.deliveryStatus === 'paid' ? O.peso(o.deliveryFee) + ' paid' : o.deliveryDue ? O.peso(o.deliveryFee) + ' to pay' : 'Added when packing') + '</span></div>' : '';
    var design = o.designImage ? '<img class="track-design" src="' + esc(hqAsset(o.designImage)) + '" alt="Your design">' : '<p class="track-muted">No design preview was saved for this order.</p>';
    var info = (o.info || []).map(function (x) { return '<div class="summary-row"><span>' + esc(x.label) + '</span><span style="text-align:right;white-space:pre-line;">' + esc(x.value) + '</span></div>'; }).join('');
    var actions = '';
    if (o.paymentStatus === 'unpaid' && o.status !== 'cancelled') actions += '<button type="button" class="btn btn-filled" id="trkPay">Pay now ' + O.peso(o.due) + '</button>';
    if (o.canCancel) actions += '<button type="button" class="btn btn-danger" id="trkCancel">Cancel order</button>';
    else if (o.status !== 'cancelled' && o.status !== 'completed') actions += '<p class="track-muted">This order is being processed, so it can no longer be cancelled.</p>';

    if (o.deliveryDue) actions = '<button type="button" class="btn btn-filled" id="trkPayDel">Pay delivery fee ' + O.peso(o.deliveryFee) + '</button>' + actions;
    $('trackResultBody').innerHTML =
      '<div class="track-result-head"><div><h2>' + esc(o.orderId) + '</h2><p>' + esc(o.service) + ' &times; ' + o.qty + ' &middot; placed ' + O.dateText(o.date) + '</p></div><span class="st-badge st-' + o.status + '">' + O.LABEL[o.status] + '</span></div>' +
      steps +
      '<div class="track-result-grid">' +
        '<div class="track-card"><h3>Payment Summary</h3><div class="summary">' +
          '<div class="summary-row"><span>Total</span><span>' + O.peso(o.total) + '</span></div>' +
          '<div class="summary-row"><span>' + esc(O.payText(o)) + '</span><span>' + O.peso(o.paid) + '</span></div>' +
          deliveryRow +
          (o.status !== 'cancelled' ? '<div class="summary-row is-total"><span>Balance (pay on pickup / delivery)</span><span>' + O.peso(o.balance) + '</span></div>' : '') +
        '</div>' + (info ? '<h3 style="margin-top:18px;">Details</h3><div class="summary">' + info + '</div>' : '') + '</div>' +
        '<div class="track-card"><h3>Your Design</h3>' + design + '</div>' +
      '</div><div class="track-actions">' + actions + '</div>';

    $('trackResult').hidden = false;
    var pd = $('trkPayDel'); if (pd) pd.addEventListener('click', function () { pd.disabled = true; O.payDelivery(o); });
    var pay = $('trkPay'); if (pay) pay.addEventListener('click', function () { pay.disabled = true; O.payNow(o); });
    var cn = $('trkCancel'); if (cn) cn.addEventListener('click', async function () {
      cn.disabled = true; var u = await O.cancel(o);
      if (u) { orders[orders.indexOf(o)] = u; refreshOptions(u.orderId); render(u); } else cn.disabled = false;
    });
  }
  function refreshOptions(keep) {
    sel.innerHTML = orders.map(function (o) { return '<option value="' + esc(o.orderId) + '">' + esc(o.orderId) + ' \u2014 ' + esc(o.service) + ' (' + O.LABEL[o.status] + ')</option>'; }).join('');
    sel.value = keep;
  }
  function show() { var o = orders.find(function (x) { return x.orderId === sel.value; }); if (o) render(o); }

  $('trackForm').addEventListener('submit', function (e) { e.preventDefault(); show(); });
  var want = new URLSearchParams(location.search).get('order');
  if (want && orders.some(function (o) { return o.orderId === want; })) { sel.value = want; show(); }
});
