(function ($) {
  'use strict';

  var howareyou = window.howareyou = {};
  howareyou.report_height = report_height;

  var API_HOST = 'https://api.howareyou.com';

  var APP_KEYS = {
    id: 'af29e503d50d6afecc766e5c341eed62',
    key: '21fceb5c43f4a881e392eef7612fbcb3',
    secret: '82f242630823dbf7b2c6c72ed74eab9f'
  };

  if (/^(((\d+\.){3}(\d+))|localhost)$/.test(location.hostname)) {
    API_HOST = '//' + location.hostname + ':9292';
  }

  if ((/MSIE [789]/).test(navigator.userAgent)) {
    window.console = { log: function () {} };
  }

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

  var DEMO_EMAIL = 'demo@howareyou.com';
  var DEMO_PASSWORD = 'Password1';

  var AUTHENTICATE_ENDPOINT = API_HOST + '/users/authenticate';
  var REGISTER_ENDPOINT     = API_HOST + '/users/register';

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

    if (user) {
      set_config(user);
    }


    if (location.hash === '#register') {
      show('#howareyou_register_modal');
    }


    // Read config from credestials automatically on blur.
    credestials_inputs.on('blur', read_config_from_ui);

    post(AUTHENTICATE_ENDPOINT, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      app_id: APP_KEYS.id
    }, function (new_user) {
      $.extend(demo_user, new_user);
      if (!user) {
        set_config(demo_user);
      }
    }, function (error) {
      console.log('Error while authenticating demo user', error);
    });

    $('#howareyou_use_own_keys').click(function (event) {
      event.preventDefault();
      if (user) {
        set_config(user);
      } else {
        show('#howareyou_login_modal');
      }
    });

    $('#howareyou_login_modal form').submit(function (event) {
      event.preventDefault();
      var form = this;

      var data = $(form).serializeArray();
      data.push({ name: 'app_id', value: APP_KEYS.id });

      var demo_note = $('#howareyou_demo_note');

      login_status.text('Signing in...');

      post(AUTHENTICATE_ENDPOINT, data, function (user) {
        form.reset();
        login_status.text('');
        hide_current();

        remember(user);
        set_config(user);
      }, function (error) {
        if (error) {
          demo_note.show();
          login_status.text('Invalid email or password.');
        }
      });
    });

    $('#howareyou_register_modal form').submit(function (event) {
      event.preventDefault();

      var form = this;

      register_status.text('Registering...');

      var pass1 = $('#howareyou_register_password');
      var pass2 = $('#howareyou_register_password2');

      if (pass1.val() !== pass2.val()) {
        register_status.text('Passwords differ.');
        return;
      }

      var data = $(this).serializeArray();

      post(REGISTER_ENDPOINT, data, function (user) {
        form.reset();
        show('#howareyou_credestials');

        remember(user);
        set_config(user);
      }, function (error) {
        register_status.text(
          error.first_name ? 'Invalid first name.' :
          error.last_name  ? 'Invalid last name.'  :
          error.email      ? 'Invalid email.'      :
          error.password   ? 'Invalid password.'   :
          error);
      });
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
    }, {
      select: '#howareyou_show_login',
      show:   '#howareyou_login_modal',
      focus:  '#howareyou_login_email'
    }, {
      select: '#howareyou_show_register',
      show:   '#howareyou_register_modal',
      focus:  '#howareyou_register_first_name'
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

  function post (endpoint, data, success, error) {
    $.ajax({
      type: 'POST',
      url:   endpoint,
      data:  data
    }).done(function (data) {
      var user = {
        user_id:         data.user.id,
        patient_id:      data.user.patient_id,
        consumer_key:    APP_KEYS.key,
        consumer_secret: APP_KEYS.secret,
        token:           data.access_token.token,
        token_secret:    data.access_token.secret,
        session:         data.session
      };

      success(user);
    }).fail(function (xhr, _, status) {
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
})(jQuery);
