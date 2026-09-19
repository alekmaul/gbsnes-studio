import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import Highlighter from "react-highlight-words";
import { connect } from "react-redux";
import ScrollIntoViewIfNeeded from "react-scroll-into-view-if-needed";
import Button from "../library/Button";
import { CaretRightIcon, StarIcon } from "../ui/icons/Icons";
import {
  EventsOnlyForActors,
  EventsHidden,
  EVENT_TEXT,
  EVENT_CALL_CUSTOM_EVENT
} from "../../lib/compiler/eventTypes";
import l10n from "../../lib/helpers/l10n";
import trimlines from "../../lib/helpers/trimlines";
import events from "../../lib/events";
import { CustomEventShape } from "../../store/stateShape";
import { customEventSelectors } from "../../store/features/entities/entitiesState";
import settingsActions from "../../store/features/settings/settingsActions";

// v4: the flat search-only list was replaced with a GB Studio 3.2.1-style
// Favorites/Categories menu (Scene/Camera/Actor/... - see settingsState.ts
// `favoriteEvents`), matching the picker's real design instead of always
// dumping every event id into one list. The search box (already working)
// still searches the whole flat list unchanged - only the closed-search
// "root" view is now grouped, drilling into a category on click.
class AddCommandButton extends Component {
  constructor(props) {
    super(props);
    this.button = React.createRef();
    this.state = {
      query: "",
      selectedIndex: 0,
      selectedCategoryIndex: -1,
      open: false,
      pasteMode: false
    };
    this.timeout = null;
  }

  componentDidMount() {
    window.addEventListener("keydown", this.detectPasteMode);
    window.addEventListener("keyup", this.detectPasteMode);
    window.addEventListener("blur", this.onBlur);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.detectPasteMode);
    window.removeEventListener("keyup", this.detectPasteMode);
    window.removeEventListener("blur", this.onBlur);
  }

  detectPasteMode = e => {
    if (e.target.nodeName !== "BODY") {
      return;
    }
    this.setState({ pasteMode: e.altKey || e.ctrlKey });
  };

  onBlur = e => {
    this.setState({ pasteMode: false });
  };

  onOpen = (e) => {
    if (e.altKey || e.ctrlKey) {
      const { onPaste } = this.props;
      onPaste();
      return;
    }
    this.setState({
      open: true,
      query: "",
      selectedCategoryIndex: -1,
      selectedIndex: 0
    });
  };

  onClose = () => {
    this.timeout = setTimeout(() => {
      this.setState({
        open: false
      });
    }, 500);
  };

  onAdd = action => () => {
    const { onAdd } = this.props;
    clearTimeout(this.timeout);
    const fullList = this.fullList();
    const index = fullList.findIndex(event => event.key === action);
    onAdd(fullList[index].id, fullList[index].args, fullList[index].children);
    this.setState({
      open: false,
      query: "",
      selectedCategoryIndex: -1,
      selectedIndex: index
    });
  };

  onAddText = () => {
    const { onAdd } = this.props;
    const { query } = this.state;
    clearTimeout(this.timeout);
    onAdd(EVENT_TEXT, { text: trimlines(query) });
    this.setState({
      open: false,
      query: "",
      selectedCategoryIndex: -1,
      selectedIndex: 0
    });
  };

  onHover = actionIndex => () => {
    this.setState({
      selectedIndex: actionIndex
    });
  };

  onSearch = e => {
    this.setState({
      query: e.currentTarget.value,
      selectedCategoryIndex: -1,
      selectedIndex: 0
    });
  };

  onSelectCategory = categoryIndex => () => {
    this.setState({
      selectedCategoryIndex: categoryIndex,
      selectedIndex: 0
    });
  };

  onBack = () => {
    this.setState({
      selectedCategoryIndex: -1,
      selectedIndex: 0
    });
  };

  onToggleFavorite = key => e => {
    const { dispatch } = this.props;
    e.preventDefault();
    e.stopPropagation();
    dispatch(settingsActions.toggleFavoriteEvent(key));
  };

  onKeyDown = e => {
    const { selectedIndex, query, selectedCategoryIndex } = this.state;
    const items = this.visibleItems();
    if (e.key === "Enter") {
      const item = items[selectedIndex];
      if (item && item.kind === "category") {
        this.onSelectCategory(item.categoryIndex)();
      } else if (item) {
        this.onAdd(item.action.key)();
      } else if (query.length > 0) {
        this.onAddText();
      }
    } else if (e.key === "Escape") {
      if (!query && selectedCategoryIndex !== -1) {
        this.onBack();
      } else {
        this.setState({
          open: false
        });
      }
    } else if (e.key === "ArrowDown") {
      this.setState({
        selectedIndex: Math.min(items.length - 1, selectedIndex + 1)
      });
    } else if (e.key === "ArrowUp") {
      this.setState({ selectedIndex: Math.max(0, selectedIndex - 1) });
    } else {
      this.setState({
        selectedIndex: Math.max(0, Math.min(items.length - 1, selectedIndex))
      });
    }
  };

  onKeyUp = e => {
    const { selectedIndex } = this.state;
    const items = this.visibleItems();
    this.setState({
      selectedIndex: Math.max(0, Math.min(items.length - 1, selectedIndex))
    });
  };

  isFavorite = key => {
    const { favoriteEvents } = this.props;
    return favoriteEvents.indexOf(key) > -1;
  };

  fullList = () => {
    const { type, customEvents } = this.props;

    let callCustomEventEvents = [];
    if (type !== "customEvent") {
      const templateEventCallCustomEvent = events[EVENT_CALL_CUSTOM_EVENT];
      callCustomEventEvents = customEvents.map((customEvent, index) => {
        if (!customEvent) return {};
        const customEventName =
          customEvent.name || `${l10n("CUSTOM_EVENT")} ${index + 1}`;
        const name = `${l10n("CUSTOM_EVENT")}: ${customEventName}`;
        const searchName = `${name.toUpperCase()}`;
        return {
          ...templateEventCallCustomEvent,
          args: {
            customEventId: customEvent.id,
            __name: customEventName
          },
          children: {
            script: customEvent.script
          },
          name,
          searchName,
          key: `EVENT_CALL_CUSTOM_EVENT_${index}`,
          isCustomEventInstance: true
        };
      });
    }

    return [
      ...Object.keys(events)
        .filter(key => {
          return (
            EventsHidden.indexOf(key) === -1 &&
            (type === "actor" || EventsOnlyForActors.indexOf(key) === -1)
          );
        })
        .map(key => {
          const localisedKey = l10n(key);
          const name = localisedKey !== key
            ? localisedKey
            : events[key].name || key;
          const searchName = `${name.toUpperCase()} ${key.toUpperCase()}`;
          return {
            ...events[key],
            name,
            searchName,
            key
          };
        }),
      ...callCustomEventEvents
    ];
  };

  filteredList = () => {
    const { query } = this.state;
    const fullList = this.fullList();

    if (!query) {
      return fullList;
    }

    const queryWords = query.toUpperCase().split(" ");

    return fullList
      .filter(event => {
        // Split filter into words so they can be in any order
        // and have words between matches
        return queryWords.reduce((memo, word) => {
          return memo && event.searchName.indexOf(word) > -1;
        }, true);
      })
      .sort((a, b) => {
        // Sort so that first match is listed at top
        const firstMatchA = queryWords.reduce((memo, word) => {
          const index = a.searchName.indexOf(word);
          return index > -1 ? Math.min(memo, index) : memo;
        }, Number.MAX_SAFE_INTEGER);
        const firstMatchB = queryWords.reduce((memo, word) => {
          const index = b.searchName.indexOf(word);
          return index > -1 ? Math.min(memo, index) : memo;
        }, Number.MAX_SAFE_INTEGER);
        return firstMatchA - firstMatchB;
      });
  };

  // Root (search-closed) view: every event grouped by its `groups` field
  // (EVENT_GROUP_ACTOR, EVENT_GROUP_CAMERA, ... - src/lib/events/event*.js,
  // ported from GB Studio 3.2.1's own event files), an event with no
  // `groups` at all falls into EVENT_GROUP_MISC same as GB. Favorites
  // resolve against the fullList entries directly so a favorited event
  // still shows its live name/args.
  rootOptions = () => {
    const { favoriteEvents } = this.props;
    const fullList = this.fullList();
    const byKey = {};
    fullList.forEach(event => {
      byKey[event.key] = event;
    });

    const byName = (a, b) => {
      if (a.name === b.name) return 0;
      return a.name < b.name ? -1 : 1;
    };

    const favorites = favoriteEvents
      .map(id => byKey[id])
      .filter(Boolean)
      .sort(byName);

    const groupedEvents = {};
    fullList.forEach(event => {
      const eventGroups =
        Array.isArray(event.groups) && event.groups.length > 0
          ? event.groups
          : ["EVENT_GROUP_MISC"];
      eventGroups.forEach(group => {
        if (!groupedEvents[group]) {
          groupedEvents[group] = [];
        }
        groupedEvents[group].push(event);
      });
    });

    const categories = Object.keys(groupedEvents)
      .map(group => ({
        key: group,
        name: l10n(group),
        options: groupedEvents[group].sort(byName)
      }))
      .sort((a, b) => {
        if (a.key === "EVENT_GROUP_MISC") return 1;
        if (b.key === "EVENT_GROUP_MISC") return -1;
        return byName(a, b);
      });

    return { favorites, categories };
  };

  // Flattens whichever view is currently showing (search results / root
  // Favorites+Categories / a drilled-in category's own events) into one
  // array so keyboard nav and click handlers share a single index space -
  // each item also carries a `groupLabel` on the first item of a section,
  // rendered as a header row (mirrors GB Studio 3.2.1's own AddScriptEventMenu
  // approach for the same reason: one list to walk, not two nested ones).
  visibleItems = () => {
    const { query, selectedCategoryIndex } = this.state;
    if (query) {
      return this.filteredList().map(action => ({ kind: "event", action }));
    }

    const { favorites, categories } = this.rootOptions();

    if (selectedCategoryIndex === -1) {
      const items = [];
      favorites.forEach((action, index) => {
        items.push({
          kind: "event",
          action,
          groupLabel: index === 0 ? l10n("FIELD_FAVORITES") : undefined
        });
      });
      categories.forEach((category, categoryIndex) => {
        items.push({
          kind: "category",
          category,
          categoryIndex,
          groupLabel: categoryIndex === 0 ? l10n("FIELD_CATEGORIES") : undefined
        });
      });
      return items;
    }

    const category = categories[selectedCategoryIndex];
    return category
      ? category.options.map(action => ({ kind: "event", action }))
      : [];
  };

  render() {
    const { query, open, selectedIndex, pasteMode, selectedCategoryIndex } = this.state;
    const { onPaste } = this.props;
    const items = open ? this.visibleItems() : [];
    const currentCategory =
      open && !query && selectedCategoryIndex > -1
        ? this.rootOptions().categories[selectedCategoryIndex]
        : null;

    return (
      <div ref={this.button} className="AddCommandButton">
        {pasteMode ? (
          <Button onClick={onPaste}>{l10n("MENU_PASTE_EVENT")}</Button>
        ) : (
          <Button onClick={this.onOpen}>{l10n("SIDEBAR_ADD_EVENT")}</Button>
        )}
        {open && (
          <div className={cx("AddCommandButton__Menu")}>
            {currentCategory && (
              <div
                className="AddCommandButton__CategoryHeader"
                onClick={this.onBack}
              >
                <span className="AddCommandButton__BackIcon">
                  <CaretRightIcon />
                </span>
                {currentCategory.name}
              </div>
            )}
            <div className="AddCommandButton__Search">
              <input
                autoFocus
                placeholder="Search..."
                onChange={this.onSearch}
                onKeyDown={this.onKeyDown}
                onKeyUp={this.onKeyUp}
                onBlur={this.onClose}
                value={query}
              />
            </div>
            <div className="AddCommandButton__List">
              {items.map((item, itemIndex) => (
                <React.Fragment
                  key={
                    item.kind === "category"
                      ? `category:${item.category.key}`
                      : item.action.key
                  }
                >
                  {item.groupLabel && (
                    <div className="AddCommandButton__GroupHeader">
                      {item.groupLabel}
                    </div>
                  )}
                  {item.kind === "category" ? (
                    <div
                      className={cx(
                        "AddCommandButton__ListItem",
                        "AddCommandButton__ListItem--Category",
                        {
                          "AddCommandButton__ListItem--Selected":
                            selectedIndex === itemIndex
                        }
                      )}
                      onClick={this.onSelectCategory(item.categoryIndex)}
                      onMouseEnter={this.onHover(itemIndex)}
                    >
                      {item.category.name}
                      <span className="AddCommandButton__Spacer" />
                      <span className="AddCommandButton__Caret">
                        <CaretRightIcon />
                      </span>
                    </div>
                  ) : (
                    <ScrollIntoViewIfNeeded
                      active={selectedIndex === itemIndex}
                      options={{
                        behavior: "instant",
                        block: "nearest"
                      }}
                      className={cx("AddCommandButton__ListItem", {
                        "AddCommandButton__ListItem--Selected":
                          selectedIndex === itemIndex
                      })}
                      onClick={this.onAdd(item.action.key)}
                      onMouseEnter={this.onHover(itemIndex)}
                    >
                      <Highlighter
                        highlightClassName="AddCommandButton__ListItem__Highlight"
                        searchWords={query.split(" ")}
                        autoEscape
                        textToHighlight={item.action.name}
                      />
                      <span className="AddCommandButton__Spacer" />
                      {!item.action.isCustomEventInstance && (
                        <span
                          className={cx("AddCommandButton__Star", {
                            "AddCommandButton__Star--Active": this.isFavorite(
                              item.action.key
                            )
                          })}
                          onClick={this.onToggleFavorite(item.action.key)}
                        >
                          <StarIcon />
                        </span>
                      )}
                    </ScrollIntoViewIfNeeded>
                  )}
                </React.Fragment>
              ))}
              {open && query.length > 0 && items.length === 0 && (
                <div
                  className={cx(
                    "AddCommandButton__ListItem",
                    "AddCommandButton__ListItem--Selected"
                  )}
                  onClick={this.onAddText}
                >
                  <Highlighter
                    highlightClassName="AddCommandButton__ListItem__Highlight"
                    searchWords={query.split(" ")}
                    autoEscape
                    textToHighlight={`${l10n(EVENT_TEXT)} "${query}"`}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
}

AddCommandButton.propTypes = {
  onAdd: PropTypes.func.isRequired,
  onPaste: PropTypes.func.isRequired,
  type: PropTypes.string.isRequired,
  customEvents: PropTypes.arrayOf(CustomEventShape).isRequired,
  favoriteEvents: PropTypes.arrayOf(PropTypes.string).isRequired,
  dispatch: PropTypes.func.isRequired
};

function mapStateToProps(state) {
  const customEvents = customEventSelectors.selectAll(state);
  const favoriteEvents = state.project.present.settings.favoriteEvents || [];
  return {
    customEvents,
    favoriteEvents
  };
}

export default connect(mapStateToProps)(AddCommandButton);
