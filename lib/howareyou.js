(function ($) {
  'use strict';

  var howareyou = window.howareyou = {};
  howareyou.report_height = report_height;

  var API_HOST = location.protocol + "//" + location.hostname;
  var AUTH_HOST = {
    "apistaging.howareyou.com": "https://authstaging.howareyou.com",
    "api.howareyou.com":        "https://auth.howareyou.com"
  }[location.hostname];

  var APP_KEYS = {
    id: '92bd37b6dc98f265b929ee9bde481426',
    key: '8462d6e3000946128f892275f1e08b3b',
    secret: '32dd9231508fcf1cf44cb20254f7af88'
  };

  var api_ports = {
    chid: 9292,
    cds: 9005,
    cda: 9014,
    chea: 9015,
    nhschoices: 9012,
    snomed: 9494,
    sms: 9017
  };

  howareyou.apis = [];

  if (/^(((\d+\.){3}(\d+))|localhost)$/.test(location.hostname)) {
    var host = '//' + location.hostname;

    API_HOST = host + ':9292';
    AUTH_HOST = host + ':9013';

    for (var api in api_ports) {
      var port = api_ports[api];
      howareyou.apis.push(host + ":" + port + "/" + api + "_doc.json");
    }

    APP_KEYS = {
      id: '9bc9ca6dcb8746e8acac5a5579118231',
      key: '9c62b768bb2823fe21b2d1b8cef899a1',
      secret: 'f98f9f35eb0097f829c75ac455442301'
    };

  } else {
    for (var api in api_ports) {
      var port = api_ports[api];
      howareyou.apis.push(API_HOST + "/" + api + "_doc.json");
    }
  }

  // Replace auth link if we are on localhost
  $(document).ready(function() {
    var local_auth = 'http://' + AUTH_HOST + '?app_id=' + APP_KEYS.id;
    $('.howareyou_auth').attr('href', local_auth);
  });

  if ((/MSIE [789]/).test(navigator.userAgent)) {
    window.console = { log: function () {} };
  }

  var AUTHENTICATE_ENDPOINT = API_HOST + '/users/authenticate';

  // Reporting content height to parent window when in iframe for
  // resizing the iframe
  if (window.parent != window && window.postMessage) {
    document.documentElement.className += 'iframe';

    $(function () {
      // Intercepting all animate calls to register a callback that
      // will report the resulting content height.

      var animate = $.prototype.animate;
      $.prototype.animate = intercepted_animate;

      function intercepted_animate (props, duration, easing, complete) {
        var options;
        if (typeof duration === 'object') {
          options = duration;
          complete = options.complete;
          options.complete = animation_end;
        } else {
          options = {
            duration: duration,
            easing: easing,
            complete: animation_end
          };
        }

        return animate.call(this, props, options);

        function animation_end () {
          report_height();

          if (complete) {
            complete.apply(this, arguments);
          }
        }
      }
    });
  }

  function report_height () {
    var element, height;
    if (window.parent !== window && window.postMessage) {
      element = $('#swagger-ui-container');
      height = element.prop('offsetHeight') + element.prop('offsetTop');
      window.parent.postMessage('height:' + height, '*');
    }
  }

  howareyou.API_HOST = API_HOST;

  howareyou.gen_headers = gen_headers;
  howareyou.refresh_user_ids = refresh_user_ids;
  howareyou.set_config = set_config;
  howareyou.check_config = check_config;

  howareyou.api_id = api_id;

  var DEMO_EMAIL = 'demo@howareyou.com';
  var DEMO_PASSWORD = 'Password1';

  var LS = window.localStorage;
  var LOCAL_STORAGE_USER_KEY = 'howareyou_user_token';

  var auth, current_config, session;
  var current_modal;
  var form, credestials_inputs, login_status, register_status;

  var demo_user = {
    user_id:         "",
    consumer_key:    "",
    consumer_secret: "",
    patient_id:      ""
  };

  var user;

  current_config = user || demo_user;

  $(function () {
    credestials_inputs = $('#howareyou_credestials form input');
    login_status = $('#howareyou_login_status');
    register_status = $('#howareyou_register_status');

    var authenticate_data = getQueryParameter('authenticate_data');
    var authentication_status = getQueryParameter('authentication_status');

    if (authentication_status || authenticate_data) {
      // Authentiacate demo user to be able to switch between own and
      // demo keys.
      authenticate_demo();
    }

    if (authenticate_data) {
      set_logged_in_user(JSON.parse(authenticate_data));
    } else if (authentication_status === "success") {
      $.ajax({
        url: AUTH_HOST + '/authentication_data',
        crossDomain: true,
        dataType: 'json',
        xhrFields: {
          withCredentials: true
        }
      }).done(set_logged_in_user);
    } else {
      authenticate_demo(set_config);
    }

    // Read config from credestials automatically on blur.
    credestials_inputs.on('blur', read_config_from_ui);

    $('#howareyou_use_own_keys').click(function (event) {
      if (user) {
        event.preventDefault();
        set_config(user);
      }
    });

    $('#howareyou_logout').click(function (event) {
      event.preventDefault();

      user = undefined;

      set_config(demo_user);
    });

    $('#howareyou_use_demo_keys').click(function (event) {
      event.preventDefault();
      set_config(demo_user);
    });

    // Iterate over elements in the header and show corresponding
    // modals on click.
    $([{
      select: '#howareyou_show_credestials',
      show:   '#howareyou_credestials',
      focus:  '#howareyou_user_id'
    }]).each(function (i, options) {
      $(options.select).click(function (event) {
        event.preventDefault();
        show(options.show);
        if (options.focus) {
          $(options.focus).focus();
        }
      });
    });

    $(window).on('keydown', function (event) {
      if (event.keyCode == 27) hide_current();
    });

    $('.howareyou_hide_modal').click(function (event) {
      event.preventDefault();
      hide_current();
    });
  });

  function gen_headers (obj) {
    return auth ? {
      Authorization: auth(obj.type, obj.url, obj.data),
      'X-Chid-Session': session
    } : {};
  }

  function authenticate_demo (success, error) {
    post(AUTHENTICATE_ENDPOINT, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      app_id: APP_KEYS.id
    }, function (data) {
      demo_user = get_user(data);
      if (success) success(demo_user);
    }, function (error_obj) {
      console.log('Error while authenticating user', error_obj);
      if (error) error(error_obj);
    });
  }

  function post (endpoint, data, success, error) {
    $.ajax({
      type: 'POST',
      url:   endpoint,
      data:  data
    }).done(success).fail(function (xhr, _, status) {
      var response = {};

      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {}

      error(response.errors || response.error || status);
    });
  }

  function read_config_from_ui (event) {
    var config = {};
    credestials_inputs.each(function (index, field) {
      field = $(field);
      config[field.data('name')] = $.trim(field.val());
    });
    set_credestials_ui(config);
  }

  function set_credestials (config) {
    current_config = config;
    auth = ohauth.headerGenerator(config);
  }

  function set_session (obj) {
    session = JSON.stringify(obj);
  }

  function set_credestials_ui (config) {
    var name, selector, field;

    set_user_ids(config.user_id);
    set_patient_ids(config.patient_id);
    set_app_ids(APP_KEYS.id);
    set_credestials(config);

    for (name in config) {
      selector = '#howareyou_' + name;
      field = $(selector);
      field.val(config[name]);
      field.data('name', name);
    }
  }

  function set_user_ids (id) {
    $('input[name="user_id"], input[name="customer_id"]').val(id);
  }

  function set_patient_ids (id) {
    $('input[name="patient_id"]').val(id);
  }

  function set_app_ids (id) {
    $('input[name="app_id"], textarea[name="app_id"]').val(id);
  }

  function refresh_user_ids () {
    set_user_ids(current_config.user_id);
    set_patient_ids(current_config.patient_id);
    set_app_ids(APP_KEYS.id);
  }

  function set_logged_in_user (data) {
    user = get_user(data);
    set_config(user);
  }

  function set_config (config) {
    if (!check_config(config)) {
      return false;
    }

    current_config = config;
    set_credestials_ui(config);
    set_session(config.session);
    return true;
  }

  function check_config (config) {
    if (user) {
      set_logged_in();
    } else {
      set_logged_out();
    }

    var ok = typeof config === 'object';

    return ok;
  }

  function show (modal) {
    hide_current();

    modal = $(modal);

    current_modal = modal;

    modal
      .css('top', '-400px')
      .show()
      .animate({
        opacity: 1,
        top: 0
      });
  }

  function hide (modal) {
    current_modal = undefined;

    modal.animate({
      opacity: 0,
      top: '-400px'
    }, function () {
      modal.hide();
    });
  }

  function hide_current () {
    if (current_modal) hide(current_modal);
  }

  function set_logged_in () {
    $('.howareyou_logged_in').show();
    $('.howareyou_demo').hide();
  }

  function set_logged_out () {
    $('.howareyou_logged_in').hide();
    $('.howareyou_demo').show();
  }

  function remember (config) {
    user = config;
    if (LS && config) {
      LS.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(config));
    }
  }

  function get_user (data) {
    if (!data || !data.user || !data.session || !data.access_token) {
      return null;
    }

    return {
      user_id:         data.user.id,
      patient_id:      data.user.patient_id,
      consumer_key:    APP_KEYS.key,
      consumer_secret: APP_KEYS.secret,
      token:           data.access_token.token,
      token_secret:    data.access_token.secret,
      session:         data.session
    };
  }

  // http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values
  function getQueryParameter (name) {
    name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
  }

  function api_id (url) {
    return url.replace(/[^a-z]/g, '');
  }
})(jQuery);
