/* Any copyright is dedicated to the Public Domain.
 * https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from head-sidebar.js */
Services.scriptloader.loadSubScript(
  getRootDirectory(gTestPath) + "head-sidebar.js",
  this
);

add_setup(() => setupSidebarTests());

function assertInsideSidebar(element, message) {
  const rect = element.getBoundingClientRect();
  const sidebar = SidebarController.sidebarMain.getBoundingClientRect();
  Assert.greater(rect.width, 0, `${message}: width`);
  Assert.greater(rect.height, 0, `${message}: height`);
  Assert.greaterOrEqual(rect.left, sidebar.left - 1, `${message}: left edge`);
  Assert.lessOrEqual(rect.right, sidebar.right + 1, `${message}: right edge`);
  return rect;
}

add_task(async function test_pinned_tab_list() {
  const tabs = [];
  try {
    for (let i = 0; i < 2; i++) {
      const tab = await BrowserTestUtils.openNewForegroundTab(
        gBrowser,
        `data:text/html,<title>Pinned tab ${i}</title>`
      );
      tabs.push(tab);
      gBrowser.pinTab(tab);
    }
    for (const treeEnabled of [false, true]) {
      for (const visibility of ["always-show", "expand-on-hover"]) {
        await withSidebarPrefs(
          [
            [PREF_TREE_ENABLED, treeEnabled],
            ["browser.tabs.pinnedIconOnly", false],
            [SIDEBAR_VISIBILITY_PREF, visibility],
          ],
          async () => {
            await SidebarController.toggleExpandOnHover(
              visibility === "expand-on-hover"
            );
            SidebarController._state.launcherExpanded = true;
            await waitForRepaint();
            const [first, second] = tabs.map(tab =>
              tab.getBoundingClientRect()
            );
            Assert.greater(first.width, 80, "Pinned rows fit titles");
            is(first.left, second.left, "Pinned list rows share a column");
            Assert.greaterOrEqual(
              second.top,
              first.bottom,
              "Pins use separate rows"
            );
            for (const tab of tabs) {
              const rect = assertInsideSidebar(tab, "Expanded pinned tab");
              const label = tab.querySelector(".tab-label-container");
              ok(BrowserTestUtils.isVisible(label), "Pinned title visible");
              Assert.greater(
                label.getBoundingClientRect().width,
                0,
                "Title has width"
              );
              ok(
                tab.contains(
                  document.elementFromPoint(
                    rect.x + rect.width / 2,
                    rect.y + rect.height / 2
                  )
                ),
                "The pinned tab receives pointer input"
              );
              ok(
                !gBrowser.tabContainer.isContainerVerticalPinnedGrid(tab),
                "Drag handling and hover previews treat labeled pins as a list"
              );
            }
            if (treeEnabled && visibility === "always-show") {
              EventUtils.synthesizeMouseAtCenter(tabs[0], {});
              is(
                gBrowser.selectedTab,
                tabs[0],
                "A labeled pin can be selected"
              );
              await openTabContextMenu(tabs[0]);
              try {
                ok(
                  !document.getElementById("context_unpinTab").hidden,
                  "The pinned tab exposes its unpin command"
                );
              } finally {
                await closeTabContextMenu();
              }
            }
            SidebarController._state.launcherExpanded = false;
            await waitForRepaint();
            for (const tab of tabs) {
              assertInsideSidebar(tab, "Collapsed pinned tab");
              const label = tab.querySelector(".tab-label-container");
              ok(
                BrowserTestUtils.isHidden(label),
                "Collapsed pins are icon-only"
              );
            }
          }
        );
      }
    }
    await SidebarController.toggleExpandOnHover(false);
    SidebarController._state.launcherExpanded = true;
    await withSidebarPrefs(
      [["browser.tabs.pinnedIconOnly", true]],
      async () => {
        await waitForRepaint();
        ok(
          gBrowser.tabContainer.isContainerVerticalPinnedGrid(tabs[0]),
          "Icon-only pins still use the grid"
        );
        for (const tab of tabs) {
          ok(
            BrowserTestUtils.isHidden(
              tab.querySelector(".tab-label-container")
            ),
            "The icon-only grid hides titles"
          );
        }
      }
    );
  } finally {
    for (const tab of tabs) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function test_collapsed_width_without_controls() {
  const controls = SidebarController.sidebarMain.buttonsWrapper;
  const wasHidden = controls.hidden;
  try {
    for (const positionStart of [true, false]) {
      await withSidebarPosition(positionStart, async () => {
        SidebarController._state.launcherExpanded = false;
        controls.hidden = true;
        await waitForRepaint();
        for (const selector of [".tab-background", ".tab-icon-image"]) {
          assertInsideSidebar(
            gBrowser.selectedTab.querySelector(selector),
            `${selector} fits without sidebar controls`
          );
        }
        await SidebarController.toggleExpandOnHover(true);
        const width =
          SidebarController.sidebarMain.getBoundingClientRect().width;
        const measured = parseFloat(
          document
            .getElementById("browser")
            .style.getPropertyValue("--sidebar-launcher-collapsed-width")
        );
        Assert.greaterOrEqual(
          measured,
          width,
          "Hover reserves collapsed width"
        );
        await SidebarController.toggleExpandOnHover(false);
      });
    }
  } finally {
    controls.hidden = wasHidden;
  }
});

add_task(async function test_private_new_tab_button_layout() {
  for (const treeEnabled of [false, true]) {
    await withSidebarPrefs(
      [
        ["browser.privateTab.showNewTabButton", true],
        [PREF_TREE_ENABLED, treeEnabled],
      ],
      async () => {
        SidebarController._state.launcherExpanded = false;
        await waitForRepaint();
        const normalButton = document.getElementById("tabs-newtab-button");
        const privateButton = document.getElementById("newPrivateTab-button");
        const normalIcon = normalButton.querySelector(".toolbarbutton-icon");
        const privateIcon = privateButton.querySelector(".toolbarbutton-icon");
        const privateLabel = privateButton.querySelector(".toolbarbutton-text");
        ok(
          BrowserTestUtils.isVisible(privateButton),
          "Private new-tab visible"
        );
        ok(BrowserTestUtils.isHidden(privateLabel), "Collapsed label hidden");
        const privateRect = assertInsideSidebar(privateIcon, "Private icon");
        const normalRect = normalIcon.getBoundingClientRect();
        is(privateRect.height, normalRect.height, "New-tab icon heights match");
        is(privateRect.x, normalRect.x, "New-tab icons align");
        is(
          normalButton.getBoundingClientRect().width,
          privateButton.getBoundingClientRect().width,
          "Collapsed new-tab button widths match"
        );
        ok(
          BrowserTestUtils.isHidden(
            document.getElementById("newPrivateTab-button-vertical")
          ),
          "The overflow-only private button is not duplicated"
        );
        SidebarController._state.launcherExpanded = true;
        await waitForRepaint();
        ok(BrowserTestUtils.isVisible(privateLabel), "Expanded label visible");
      }
    );
  }
});
