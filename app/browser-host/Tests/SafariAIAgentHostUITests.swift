import XCTest

final class SafariAIAgentHostUITests: XCTestCase {
    func testBrowserLoadsPageAndOpensLocalInspector() {
        let app = XCUIApplication()
        app.launchArguments += ["-gatewayAddress", "", "-deviceToken", ""]
        app.launch()

        XCTAssertTrue(app.staticTexts["Gateway disconnected."].waitForExistence(timeout: 5))
        let connectButton = app.buttons["Connect"]
        XCTAssertTrue(connectButton.exists)
        XCTAssertFalse(connectButton.isEnabled)

        let inspectButton = app.buttons["Inspect locally"]
        XCTAssertTrue(inspectButton.exists)
        XCTAssertFalse(inspectButton.isEnabled)

        let goButton = app.buttons["Go"]
        XCTAssertTrue(goButton.waitForExistence(timeout: 5))
        goButton.tap()

        let enabled = NSPredicate(format: "isEnabled == true")
        expectation(for: enabled, evaluatedWith: inspectButton)
        waitForExpectations(timeout: 20)
        inspectButton.tap()

        XCTAssertTrue(app.navigationBars["Local inspection"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Title, Example Domain"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS[c] %@", "local read-only proof")).firstMatch.exists)
        XCTAssertTrue(app.buttons["Done"].exists)
    }
}
