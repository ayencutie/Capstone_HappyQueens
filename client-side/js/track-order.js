// Track Order (logged-in): pick one of your orders and see its progress, payments, delivery and design.
hqOnReady(async function () {
  var $ = function (id) { return document.getElementById(id); }, O = HQOrders, esc = hqEsc;
  var ICONS = { 'pending': 'fa-clock', 'in-design': 'fa-pen-ruler', 'printing': 'fa-print', 'packing': 'fa-box', 'out-for-delivery': 'fa-truck-fast', 'completed': 'fa-circle-check' };
  var DESC = {
    'pending': 'We received your order and it is waiting for our team to start. You can still cancel it at this step.',
    'in-design': 'Our team is preparing your layout with the details and design you gave us. From here, the order can no longer be cancelled.',
    'printing': 'Your order is being printed and made.',
    'packing': 'Your order is finished and is being checked and packed. For delivery orders, the Lalamove delivery fee is shown here.',
    'out-for-delivery': 'A Lalamove rider is bringing your order to you. Please prepare the delivery fee to pay the rider (cash on delivery).',
    'completed': 'Your order is complete. Thank you for choosing Happy Queen\'s Crafty House!'
  };
  var sel = $('orderSelect'), orders = [];

  // pickup orders have no rider: that step is "Ready for Pickup"
  function label(s, o) { return (s === 'out-for-delivery' && o.fulfillment !== 'delivery') ? 'Ready for Pickup' : O.LABEL[s]; }
  function desc(s, o) { return (s === 'out-for-delivery' && o.fulfillment !== 'delivery') ? 'Your order is ready. Please pick it up at our shop.' : DESC[s]; }
  // while the order is packing: remind the customer to pay the balance (it is paid in View Order)
  function remind(o) {
    if (!o.balanceDue || o.status !== 'packing') return '';
    return '<div class="pay-reminder"><i class="fa-solid fa-bell"></i><div><b>Please pay your balance of ' + O.peso(o.balance) + '</b><br>' +
      (o.fulfillment === 'delivery' ? 'We cannot send your order out for delivery until the balance is paid. ' : 'You can pay it now, or at the shop when you pick it up. ') +
      'Open <a href="orders.html"><b>View Order</b></a> and tap <b>Pay balance</b> (GCash / PayMaya).</div></div>';
  }
  function row(k, v) { return '<div class="trk-row"><span>' + k + '</span><span>' + v + '</span></div>'; }

  function fillOptions(keep) {
    sel.innerHTML = orders.map(function (o) { return '<option value="' + esc(o.orderId) + '">' + esc(o.orderId) + ' \u00B7 ' + esc(o.service) + ' \u00B7 ' + label(o.status, o) + '</option>'; }).join('');
    if (keep) sel.value = keep;
  }

  var r = await hqShop('my_orders');
  if (!r.ok) { sel.innerHTML = '<option value="">Could not load your orders</option>'; sel.disabled = true; $('trackSubmit').disabled = true; $('trackHelper').textContent = r.error || ''; return; }
  orders = r.orders;
  if (!orders.length) {
    sel.innerHTML = '<option value="">You have no orders yet</option>'; sel.disabled = true; $('trackSubmit').disabled = true;
    $('trackHelper').innerHTML = 'Place an order first from <a href="our-services.html"><b>Our Services</b></a>, then come back to track it.'; return;
  }
  fillOptions();

  function render(o) {
    var progress;
    if (o.status === 'cancelled') {
      var rt = O.refundText(o);
      progress = '<div class="trk-cancelled"><i class="fa-solid fa-circle-xmark"></i><div><b>This order was cancelled</b><p>' + (rt ? esc(rt) : 'No payment was taken for this order.') + '</p></div></div>';
    } else {
      var idx = O.STEPS.indexOf(o.status);
      progress = '<ol class="trk-steps">' + O.STEPS.map(function (s, i) {
        return '<li class="' + (i < idx ? 'is-done' : i === idx ? 'is-current' : '') + '"><span class="trk-dot"><i class="fa-solid ' + (i < idx ? 'fa-check' : ICONS[s]) + '"></i></span><span class="trk-label">' + esc(label(s, o)) + '</span></li>';
      }).join('') + '</ol>' +
      '<div class="trk-now"><i class="fa-solid ' + ICONS[o.status] + '"></i><div><b>Current status: ' + esc(label(o.status, o)) + '</b><p>' + esc(desc(o.status, o)) + '</p></div></div>' + remind(o);
    }

    // payment
    var payState = { paid: 'Paid in full', partial: 'Down payment paid', unpaid: 'Not paid yet' }[o.paymentStatus] || '';
    var pay = row('Order total', O.peso(o.total)) + row('Amount paid', O.peso(o.paid) + (o.paid > 0 && o.method ? ' \u00B7 ' + esc(o.method) : '')) + row('Payment status', esc(payState));
    if (o.status !== 'cancelled') pay += '<div class="trk-row is-total"><span>Balance (pay it in View Order when your order is packing)</span><span>' + O.peso(o.balance) + '</span></div>';
    var refund = O.refundText(o);
    if (refund) pay += '<div class="trk-note is-ok"><i class="fa-solid fa-rotate-left"></i> ' + esc(refund) + '</div>';

    // delivery
    var dlv;
    if (o.fulfillment === 'delivery') {
      var fee = o.deliveryStatus === 'paid' ? O.peso(o.deliveryFee) + ' \u00B7 paid' : o.deliveryCod ? O.peso(o.deliveryFee) + ' \u00B7 pay the rider on delivery (COD)' : 'Added when your order is packed \u00B7 pay the rider (COD)';
      dlv = row('Method', 'Delivery by Lalamove') + row('Address', esc(o.deliveryAddress || '\u2014')) + (o.deliveryLandmark ? row('Landmark', esc(o.deliveryLandmark)) : '') +
            row('Contact number', esc(o.contactPhone || '\u2014')) + row('Delivery fee', fee) + (o.lalamoveRef ? row('Lalamove booking', esc(o.lalamoveRef)) : '');
    } else {
      dlv = row('Method', 'Pick up at the shop') + row('Contact number', esc(o.contactPhone || '\u2014')) +
            '<div class="trk-note">Block 4 Lot 24 Satima Village, Talon Dos, Las Pi\u00F1as City</div>';
    }

    // details + design
    var info = (o.documentName ? row('Document', esc(o.documentName)) : '') + (o.photoCount ? row('Photos', o.photoCount + ' \u00D7 ' + o.copies + ' cop' + (o.copies > 1 ? 'ies' : 'y')) : '') +
               (o.info || []).map(function (x) { return row(esc(x.label), esc(x.value)); }).join('') + (o.notes ? row('Notes', esc(o.notes)) : '');
    var designs = (o.designImage ? '<figure><img src="' + esc(hqAsset(o.designImage)) + '" alt="Front of your design"><figcaption>Front</figcaption></figure>' : '') +
                  (o.designBackImage ? '<figure><img src="' + esc(hqAsset(o.designBackImage)) + '" alt="Back of your design"><figcaption>Back</figcaption></figure>' : '') +
                  (o.designInsideImage ? '<figure><img src="' + esc(hqAsset(o.designInsideImage)) + '" alt="Inside of your design"><figcaption>Inside</figcaption></figure>' : '');

    var actions = '';
    if (o.paymentStatus === 'unpaid' && o.status !== 'cancelled') actions += '<button type="button" class="btn btn-filled" id="trkPay">Pay now ' + O.peso(o.due) + '</button>';
    if (o.canCancel) actions += '<button type="button" class="btn btn-danger" id="trkCancel">Cancel order</button>';
    else if (o.status !== 'cancelled' && o.status !== 'completed') actions += '<span class="trk-muted">This order is already being processed, so it can no longer be cancelled.</span>';

    $('trackResultBody').innerHTML =
      '<div class="trk-head"><div><span class="trk-eyebrow">Order</span><h2 class="trk-code">' + esc(o.orderId) + '</h2><p class="trk-meta">' + esc(o.service) + ' \u00D7 ' + o.qty + ' \u00B7 Placed ' + O.dateText(o.date) + '</p></div><span class="st-badge st-' + o.status + '">' + esc(label(o.status, o)) + '</span></div>' +
      progress +
      '<div class="trk-grid">' +
        '<div class="trk-panel"><h3><i class="fa-solid fa-wallet"></i> Payment summary</h3>' + pay + '</div>' +
        '<div class="trk-panel"><h3><i class="fa-solid fa-location-dot"></i> ' + (o.fulfillment === 'delivery' ? 'Delivery' : 'Pickup') + '</h3>' + dlv + '</div>' +
        '<div class="trk-panel"><h3><i class="fa-solid fa-list-check"></i> Order details</h3>' + (info || '<p class="trk-muted">No extra details were needed for this order.</p>') + '</div>' +
        '<div class="trk-panel"><h3><i class="fa-solid fa-image"></i> Your design</h3>' + (designs ? '<div class="trk-designs">' + designs + '</div>' : '<p class="trk-muted">No design preview was saved for this order.</p>') + '</div>' +
      '</div>' + (actions ? '<div class="trk-actions">' + actions + '</div>' : '');

    $('trackResult').hidden = false;
    var b;
    if ((b = $('trkPay'))) b.addEventListener('click', function () { b.disabled = true; O.payNow(o); });
    if ((b = $('trkCancel'))) b.addEventListener('click', async function () {
      b.disabled = true; var u = await O.cancel(o);
      if (u) { orders[orders.indexOf(o)] = u; fillOptions(u.orderId); render(u); } else b.disabled = false;
    });
  }

  function show() { var o = orders.find(function (x) { return x.orderId === sel.value; }); if (o) render(o); }
  $('trackForm').addEventListener('submit', function (e) { e.preventDefault(); show(); });
  sel.addEventListener('change', show);
  $('trackHelper').textContent = 'Select an order, or use "View Order" in your account menu to manage your orders.';
  var want = new URLSearchParams(location.search).get('order');
  if (want && orders.some(function (o) { return o.orderId === want; })) { sel.value = want; show(); } else if (orders.length === 1) show();
});
