import SwiftUI

struct Instruction: View {
    var imageName: String
    var label: Text
    
    var body: some View {
        HStack (alignment: .center, spacing: 10){
            Image(imageName)
                .resizable()
                .renderingMode(.template)
                .frame(width: 34, height: 34)
            label
        }
    }
}
