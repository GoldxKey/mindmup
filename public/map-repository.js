/*jslint forin: true nomen: true, plusplus: true*/
/*global _, content, jQuery, MM, observable, setTimeout, window, document*/
MM.MapRepository = function (activityLog, alert, repositories) {
	// order of repositories is important, the first repository is default
	'use strict';
	observable(this);
	var dispatchEvent = this.dispatchEvent,
		mapInfo = {},
		addListeners = function (repository) {
			//Remove this once s3 repository is not redirecting after save
			if (repository.addEventListener) {
				MM.MapRepository.alerts(repository, alert);
				repository.addEventListener('mapSaved', function (key, idea) {
					dispatchEvent('mapSaved', key, idea);
				});
			}
		},
		chooseRepository = function (identifiers) {
			// order of identifiers is important, the first identifier takes precedence
			var idIndex, repoIndex;
			for (idIndex = 0; idIndex < identifiers.length; idIndex++) {
				for (repoIndex = 0; repoIndex < repositories.length; repoIndex++) {
					if (repositories[repoIndex].recognises(identifiers[idIndex])) {
						return repositories[repoIndex];
					}
				}
			}
			return repositories[0];
		},
		mapLoaded = function (newMapInfo) {
			mapInfo = _.clone(newMapInfo);
			dispatchEvent('mapLoaded', newMapInfo.idea, newMapInfo.mapId);
		};
	MM.MapRepository.mapLocationChange(this);
	MM.MapRepository.activityTracking(this, activityLog);

	MM.MapRepository.alerts(this, alert);
	MM.MapRepository.toolbarAndUnsavedChangesDialogue(this, activityLog);
	_.each(repositories, addListeners);

	this.setMap = mapLoaded;

	this.loadMap = function (mapId) {
		var repository = chooseRepository([mapId]),
			mapLoadFailed = function (reason) {
				if (reason === 'no-access-allowed') {
					dispatchEvent('mapLoadingUnAuthorized', mapId, reason);
				} else if (reason === 'failed-authentication') {
					dispatchEvent('authorisationFailed', 'We were unable to authenticate with ' + repository.description, function () {
						dispatchEvent('mapLoading', mapId);
						repository.loadMap(mapId, true).then(mapLoaded, mapLoadFailed);
					});
				} else if (reason === 'not-authenticated') {
					dispatchEvent('authRequired', 'This operation requires authentication through ' + repository.description + ' !', function () {
						dispatchEvent('mapLoading', mapId);
						repository.loadMap(mapId, true).then(mapLoaded, mapLoadFailed);
					});
				} else {
					dispatchEvent('mapLoadingFailed', mapId, reason);
				}
			};
		dispatchEvent('mapLoading', mapId);
		repository.loadMap(mapId).then(mapLoaded, mapLoadFailed);
	};

	this.publishMap = function (repositoryType) {
		var repository = chooseRepository([repositoryType, mapInfo.mapId]),
			mapSaved = function (savedMapInfo) {
				dispatchEvent('mapSaved', savedMapInfo.mapId, savedMapInfo.idea, (mapInfo.mapId !== savedMapInfo.mapId));
				mapInfo = savedMapInfo;
			},
			mapSaveFailed = function (reason) {
				if (reason === 'no-access-allowed') {
					dispatchEvent('mapSavingUnAuthorized', function () {
						dispatchEvent('mapSaving');
						var saveAsNewInfo = _.clone(mapInfo);
						saveAsNewInfo.mapId = 'new';
						repository.saveMap(saveAsNewInfo, true).then(mapSaved, mapSaveFailed);
					});
				} else if (reason === 'failed-authentication') {
					dispatchEvent('authorisationFailed', 'We were unable to authenticate with ' + repository.description, function () {
						dispatchEvent('mapSaving');
						repository.saveMap(_.clone(mapInfo), true).then(mapSaved, mapSaveFailed);
					});
				} else if (reason === 'not-authenticated') {
					dispatchEvent('authRequired', 'This operation requires authentication through ' + repository.description + ' !', function () {
						dispatchEvent('mapSaving');
						repository.saveMap(_.clone(mapInfo), true).then(mapSaved, mapSaveFailed);
					});
				} else {
					dispatchEvent('mapSavingFailed');
				}
			};
		dispatchEvent('mapSaving');
		repository.saveMap(_.clone(mapInfo)).then(mapSaved, mapSaveFailed);
	};
};

MM.MapRepository.activityTracking = function (mapRepository, activityLog) {
	'use strict';
	var startedFromNew = function (idea) {
		return idea.id === 1;
	},
		isNodeRelevant = function (ideaNode) {
			return ideaNode.title && ideaNode.title.search(/MindMup|Lancelot|cunning|brilliant|Press Space|famous|Luke|daddy/) === -1;
		},
		isNodeIrrelevant = function (ideaNode) {
			return !isNodeRelevant(ideaNode);
		},
		isMapRelevant = function (idea) {
			return startedFromNew(idea) && idea.find(isNodeRelevant).length > 5 && idea.find(isNodeIrrelevant).length < 3;
		},
		wasRelevantOnLoad;
	mapRepository.addEventListener('mapLoading', function (mapUrl, mapId) {
		activityLog.log('loading map [' + mapUrl + ']');
	});
	mapRepository.addEventListener('mapLoaded', function (idea, mapId) {
		activityLog.log('Map', 'View', mapId);
		wasRelevantOnLoad = isMapRelevant(idea);
	});
	mapRepository.addEventListener('mapLoadingFailed', function (mapUrl, reason) {
		activityLog.error('Error loading map document [' + mapUrl + '] ' + reason);
	});
	mapRepository.addEventListener('mapSaved', function (id, idea) {
		if (isMapRelevant(idea) && !wasRelevantOnLoad) {
			activityLog.log('Map', 'Created Relevant', id);
		} else if (wasRelevantOnLoad) {
			activityLog.log('Map', 'Saved Relevant', id);
		} else {
			activityLog.log('Map', 'Saved Irrelevant', id);
		}
	});
	mapRepository.addEventListener('mapSavingFailed', function () {
		activityLog.error('Map save failed');
	});
};
MM.MapRepository.alerts = function (mapRepository, alert) {
	'use strict';
	var alertId;
	mapRepository.addEventListener('mapLoading', function () {
		alertId = alert.show('Please wait, loading the map...', '<i class="icon-spinner icon-spin"></i>');
	});
	mapRepository.addEventListener('authRequired', function (message, authCallback) {
		alert.hide(alertId);
		alertId = alert.show(message, '<a href="#" data-mm-role="auth">Click here to authenticate</a>');
		jQuery('[data-mm-role=auth]').click(function () {
			alert.hide(alertId);
			authCallback();
		});
	});
	mapRepository.addEventListener('mapLoaded', function () {
		alert.hide(alertId);
	});
	mapRepository.addEventListener('authorisationFailed', function (message, authCallback) {
		alert.hide(alertId);
		alertId = alert.show(
			message,
			'<a href="#" data-mm-role="auth">Click here to try again</a>',
			'error'
		);
		jQuery('[data-mm-role=auth]').click(function () {
			alert.hide(alertId);
			authCallback();
		});
	});
	mapRepository.addEventListener('mapLoadingUnAuthorized', function () {
		alert.hide(alertId);
		alertId = alert.show(
			'The map could not be loaded.',
			'You do not have the right to view this map',
			'error'
		);
	});
	mapRepository.addEventListener('mapSavingUnAuthorized', function (callback) {
		alert.hide(alertId);
		alertId = alert.show(
			'You do not have the right to edit this map',
			'<a href="#" data-mm-role="auth">Click here to save a copy</a>',
			'error'
		);
		jQuery('[data-mm-role=auth]').click(function () {
			alert.hide(alertId);
			callback();
		});
	});
	mapRepository.addEventListener('mapLoadingFailed', function (mapUrl, reason) {
		alert.hide(alertId);
		alertId = alert.show(
			'Unfortunately, there was a problem loading the map.',
			'An automated error report was sent and we will look into this as soon as possible',
			'error'
		);
	});
	mapRepository.addEventListener('mapSavingFailed', function () {
		alert.show(
			'Unfortunately, there was a problem saving the map.',
			'Please try again later. We have sent an error report and we will look into this as soon as possible',
			'error'
		);
	});
};
MM.MapRepository.toolbarAndUnsavedChangesDialogue = function (mapRepository, activityLog) {
	'use strict';
	var changed, saving, mapLoaded,
		toggleChange = function () {
			saving = false;
			if (!changed) {
				jQuery('#toolbarShare').hide();
				jQuery('#toolbarSave').show();
				jQuery('#menuExport').hide();
				jQuery('#menuPublish').effect('highlight');
				activityLog.log('Map', 'Edit');
				changed = true;
			}
		};
	mapRepository.addEventListener('mapLoaded', function (idea) {
		if (!mapLoaded) {
			jQuery(window).bind('beforeunload', function () {
				if (changed && !saving) {
					return 'There are unsaved changes.';
				}
			});
			mapLoaded = true;
		} else {
			toggleChange();
		}
		idea.addEventListener('changed', function (command, args) {
			toggleChange();
			activityLog.log(['Map', command].concat(args));
		});
	});
	mapRepository.addEventListener('mapSaving', function () {
		saving = true;
	});
	mapRepository.addEventListener('mapSaved', function () {
		saving = false;
		changed = false;
		jQuery('#toolbarShare').show();
		jQuery('#toolbarSave').hide();
		jQuery('#menuExport').show();
		jQuery('#menuPublish').hide();
	});
};
MM.MapRepository.mapLocationChange = function (mapRepository) {
	'use strict';
	mapRepository.addEventListener('mapSaved', function (newMapId, idea, idHasChanged) {
		if (idHasChanged) {
			document.location = "/map/" + newMapId;
		}
	});
};
