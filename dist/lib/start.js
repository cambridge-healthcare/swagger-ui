$(function () {
  "use strict";

  howareyou.apis.forEach(load);

  function load (url) {
    var id = howareyou.api_id(url);

    var container = $("#swagger-ui-container");
    container.append($("<h2>" + name(url) + "</h2>"));
    container.append($("<div id='" + id + "'></div>"));

    window.swaggerUi = new SwaggerUi({
      name: name(url),
      discoveryUrl: url,
      dom_id: id,
      supportHeaderParams: false,
      supportedSubmitMethods: ['get', 'post', 'put', 'delete'],
      onComplete: function(swaggerApi, swaggerUi){
        howareyou.refresh_user_ids();
        if(console) {
          console.log("Loaded SwaggerUI")
          console.log(swaggerApi);
          console.log(swaggerUi);
        }
        $('pre code').each(function(i, e) {hljs.highlightBlock(e)});
      },
      onFailure: function(data) {
        if(console) {
          console.log("Unable to Load SwaggerUI");
          console.log(data);
        }
      },
      docExpansion: "none",
      headersGen: howareyou.gen_headers
    });

    window.swaggerUi.load();
  }

  function name (url) {
    var match = url.match(/swagger_docs\/(.+)\//i);
    return match ? match[1].toUpperCase() : "";
  }
});
