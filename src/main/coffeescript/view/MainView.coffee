class MainView extends Backbone.View
  initialize: ->

  render: ->
    # Render the outer container for resources
    $(@el).html(Handlebars.templates.main(@model))

    # Render each resource
    @addResource resource for resource in @model.apisArray
    howareyou.report_height();
    @

  addResource: (resource) ->
    # Render a resource and add it to resources li
    api_id = howareyou.api_id(resource.api.discoveryUrl)
    resourceView = new ResourceView({model: resource, tagName: 'li', id: 'resource_' + resource.name, className: 'resource'})
    $('#' + api_id + ' .resources').append resourceView.render().el

  clear: ->
    $(@el).html ''