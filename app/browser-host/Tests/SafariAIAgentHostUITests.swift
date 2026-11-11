import XCTest

@MainActor
final class SafariAIAgentHostUITests: XCTestCase {
    func testBrowserLoadsPageAndOpensLocalInspector() {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.buttons["Continue with ChatGPT"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Ask"].isEnabled)

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
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["local-inspection-privacy-note"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Done"].exists)
    }

    func testNoRemoteGatewayPairingControlsRemain() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Continue with ChatGPT"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.textFields["gateway-origin-field"].exists)
        XCTAssertFalse(app.secureTextFields["device-token-field"].exists)
    }
}
